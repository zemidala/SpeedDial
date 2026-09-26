// Importing a browser's bookmarks file: what gets created and creating it. No Svelte
import type {HtmlBookmark} from './bookmarksHtml';
import {pageKey} from './url';

export interface ImportPlan {
  /** What will be created: without duplicates, unsupported links and folders left empty */
  nodes: HtmlBookmark[];
  bookmarks: number;
  folders: number;
  /** Links already in the bookmarks or repeated in the file */
  duplicates: number;
}

/** Firefox's "smart folders" (place:…) only make sense in Firefox; broken addresses can't be bookmarks */
function isSupported(url: string): boolean {
  try {
    return new URL(url).protocol !== 'place:';
  } catch {
    return false;
  }
}

const linkKey = (url: string) => pageKey(url) ?? url;

/** Keys of all links in the tree — for skipping ones that already exist */
export function existingLinks(nodes: {url?: string; children?: unknown[]}[]): Set<string> {
  const keys = new Set<string>();
  const visit = (node: {url?: string; children?: unknown[]}) => {
    if (node.url) keys.add(linkKey(node.url));
    (node.children as typeof nodes | undefined)?.forEach(visit);
  };
  nodes.forEach(visit);
  return keys;
}

/** existing — links to skip as duplicates; null — import everything, even repeats */
export function planImport(nodes: HtmlBookmark[], existing: Set<string> | null): ImportPlan {
  const seen = existing ? new Set(existing) : null;
  const plan: ImportPlan = {nodes: [], bookmarks: 0, folders: 0, duplicates: 0};

  const filter = (items: HtmlBookmark[]): HtmlBookmark[] => {
    const result: HtmlBookmark[] = [];
    for (const item of items) {
      if (item.url !== undefined) {
        if (!isSupported(item.url)) continue;
        const key = linkKey(item.url);
        if (seen?.has(key)) {
          plan.duplicates++;
          continue;
        }
        seen?.add(key);
        plan.bookmarks++;
        result.push(item);
        continue;
      }
      const children = filter(item.children ?? []);
      if (children.length === 0) continue;
      plan.folders++;
      result.push({...item, children});
    }
    return result;
  };
  plan.nodes = filter(nodes);
  return plan;
}

type BookmarksApi = Pick<typeof chrome.bookmarks, 'create'>;

/**
 * Creates the planned folders and bookmarks in parentId — inside a new folder if folderTitle is given.
 * Returns the id of the folder everything went into
 */
export async function runImport(
  plan: ImportPlan,
  {parentId, folderTitle}: {parentId: string; folderTitle: string | null},
  onProgress: (done: number) => void = () => undefined,
  api: BookmarksApi = chrome.bookmarks,
): Promise<string> {
  const targetId = folderTitle ? (await api.create({parentId, title: folderTitle})).id : parentId;
  let done = 0;

  const create = async (items: HtmlBookmark[], folderId: string) => {
    for (const item of items) {
      const node = await api.create({parentId: folderId, title: item.title, ...(item.url ? {url: item.url} : {})});
      if (item.children) {
        await create(item.children, node.id);
      } else {
        onProgress(++done);
      }
    }
  };
  await create(plan.nodes, targetId);
  return targetId;
}
