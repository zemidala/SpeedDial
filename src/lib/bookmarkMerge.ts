// Merging bookmarks from another browser (a SpeedDial backup or any browser's HTML export) into these ones:
// root folders by their kind (bar ↔ bar, other ↔ other), folders with the same name merge, a bookmark whose address
// is already in that folder is skipped, everything else is added. Nothing is deleted or moved. No Svelte
import {pageKey} from './url';

/** The browser's own root folders; null — not known (it lands in "Other bookmarks") */
export type RootKind = 'bookmarks-bar' | 'other' | 'mobile';

export interface MergeNode {
  title: string;
  /** Absent for folders */
  url?: string;
  children?: MergeNode[];
}

export interface MergeRoot<T extends MergeNode = MergeNode> {
  kind: RootKind | null;
  children: T[];
}

/** A folder or bookmark of the browser, as chrome.bookmarks gives it */
export interface ExistingNode {
  id: string;
  title: string;
  url?: string;
  folderType?: string;
  children?: ExistingNode[];
}

export interface MergeAddition<T extends MergeNode = MergeNode> {
  /** An existing folder to add into */
  parentId: string;
  /** What to create there — a bookmark, or a folder with what goes into it */
  node: T;
}

export interface MergePlan<T extends MergeNode = MergeNode> {
  additions: MergeAddition<T>[];
  /** Existing bookmarks the file has too — e.g. to bring their thumbnails over */
  matched: {id: string; node: T}[];
  bookmarks: number;
  /** New folders */
  folders: number;
  /** Folders of the file that went into existing ones with the same name */
  mergedFolders: number;
  /** Bookmarks skipped: the address is already in that folder */
  duplicates: number;
}

/** Chrome's and Edge's classic ids of the root folders — for backups and browsers without folderType */
const CLASSIC_KINDS: Record<string, RootKind> = {'1': 'bookmarks-bar', '2': 'other', '3': 'mobile'};

export function rootKind(node: {id?: string; folderType?: string}): RootKind | null {
  if (node.folderType === 'bookmarks-bar' || node.folderType === 'other' || node.folderType === 'mobile') {
    return node.folderType;
  }
  return node.id ? CLASSIC_KINDS[node.id] ?? null : null;
}

/** Folder names match without regard to case and extra spaces: "Games" and " games " are one folder */
export const folderKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** Addresses match without the scheme, "www." and a trailing slash; other links (file:, javascript:) — as they are */
const linkKey = (url: string) => pageKey(url) ?? url.trim();

/**
 * The browser root a file root goes to: the one of the same kind; unknown or missing kinds — "Other bookmarks",
 * then the bar, then any root. With several roots of a kind (local and account copies), the one with bookmarks
 */
function targetRoot(roots: ExistingNode[], kind: RootKind | null): ExistingNode | undefined {
  const ofKind = (wanted: RootKind) => {
    const found = roots.filter((root) => rootKind(root) === wanted);
    return found.find((root) => (root.children?.length ?? 0) > 0) ?? found[0];
  };
  return (kind && ofKind(kind)) ?? ofKind('other') ?? ofKind('bookmarks-bar') ?? roots[0];
}

/** Plans the merge of the file's roots into the browser's tree (the root node with the root folders as children) */
export function planMerge<T extends MergeNode>(source: MergeRoot<T>[], tree: ExistingNode): MergePlan<T> {
  const plan: MergePlan<T> = {additions: [], matched: [], bookmarks: 0, folders: 0, mergedFolders: 0, duplicates: 0};

  /** A new folder's contents: repeats within the file's own folder are skipped too */
  const fresh = (nodes: T[]): T[] => {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const node of nodes) {
      if (node.url !== undefined) {
        const key = linkKey(node.url);
        if (seen.has(key)) {
          plan.duplicates++;
          continue;
        }
        seen.add(key);
        plan.bookmarks++;
        result.push(node);
      } else {
        plan.folders++;
        result.push({...node, children: fresh((node.children ?? []) as T[])});
      }
    }
    return result;
  };

  /** Into an existing folder: its bookmarks and folders — and those added from the file so far — count as present */
  const into = (nodes: T[], folder: ExistingNode) => {
    const links = new Map<string, string>();
    const folders = new Map<string, ExistingNode>();
    for (const child of folder.children ?? []) {
      if (child.url !== undefined) links.set(linkKey(child.url), child.id);
      else if (!folders.has(folderKey(child.title))) folders.set(folderKey(child.title), child);
    }
    // Folders added from the file in this folder: a second folder of the same name joins the first one
    const added = new Map<string, T>();

    for (const node of nodes) {
      if (node.url !== undefined) {
        const key = linkKey(node.url);
        const existing = links.get(key);
        if (existing !== undefined) {
          plan.duplicates++;
          if (existing) plan.matched.push({id: existing, node});
          continue;
        }
        links.set(key, '');
        plan.bookmarks++;
        plan.additions.push({parentId: folder.id, node});
        continue;
      }
      const key = folderKey(node.title);
      const match = folders.get(key);
      if (match) {
        plan.mergedFolders++;
        into((node.children ?? []) as T[], match);
        continue;
      }
      const earlier = added.get(key);
      if (earlier) {
        // The same folder twice in the file: its contents join the one being added, without repeats
        const known = new Set((earlier.children ?? []).filter((child) => child.url).map((child) => linkKey(child.url!)));
        for (const child of (node.children ?? []) as T[]) {
          if (child.url !== undefined && known.has(linkKey(child.url))) {
            plan.duplicates++;
            continue;
          }
          const [created] = fresh([child]);
          earlier.children = [...(earlier.children ?? []), created];
          if (created.url) known.add(linkKey(created.url));
        }
        continue;
      }
      plan.folders++;
      const created = {...node, children: fresh((node.children ?? []) as T[])};
      added.set(key, created);
      plan.additions.push({parentId: folder.id, node: created});
    }
  };

  const roots = tree.children ?? [];
  for (const sourceRoot of source) {
    const root = targetRoot(roots, sourceRoot.kind);
    if (root) into(sourceRoot.children, root);
  }
  return plan;
}

export interface CreateApi {
  create(details: chrome.bookmarks.CreateDetails): Promise<{id: string}>;
}

/**
 * Creates what the plan adds, at the end of each folder. onCreated — after each created node (thumbnails, progress).
 * Returns the ids of the created top-level additions: removing them undoes the merge
 */
export async function runMerge<T extends MergeNode>(
  plan: MergePlan<T>,
  api: CreateApi = chrome.bookmarks,
  onCreated: (id: string, node: T) => Promise<void> | void = () => undefined,
): Promise<string[]> {
  const created: string[] = [];
  const create = async (node: T, parentId: string): Promise<string> => {
    const {id} = await api.create({parentId, title: node.title, ...(node.url !== undefined ? {url: node.url} : {})});
    await onCreated(id, node);
    for (const child of (node.children ?? []) as T[]) await create(child, id);
    return id;
  };
  for (const {parentId, node} of plan.additions) created.push(await create(node, parentId));
  return created;
}
