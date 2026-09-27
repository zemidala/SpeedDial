// Folder list for dropdowns: the tree flattened with indentation and bookmark counts; finding the browser's own folders
import {BOOKMARKS_BAR_ID, ROOT_FOLDER_ID} from './constants';

export interface FolderOption {
  id: string;
  title: string;
  depth: number;
  /** Bookmarks directly in the folder, without nested ones */
  bookmarkCount: number;
}

interface TreeNode {
  id: string;
  title: string;
  url?: string;
  children?: TreeNode[];
}

/** Folders of the tree in traversal order; the (untitled) root isn't included */
export function flattenFolders(root: TreeNode): FolderOption[] {
  const result: FolderOption[] = [];
  const visit = (node: TreeNode, depth: number) => {
    for (const child of node.children ?? []) {
      if (child.url) continue;
      result.push({
        id: child.id,
        title: child.title,
        depth,
        bookmarkCount: child.children?.filter((item) => item.url).length ?? 0,
      });
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return result;
}

/** All bookmarks of a folder; with includeSubfolders — also from nested folders */
export function collectBookmarks<T extends TreeNode>(folder: T, includeSubfolders: boolean): T[] {
  const result: T[] = [];
  for (const child of (folder.children ?? []) as T[]) {
    if (child.url) result.push(child);
    else if (includeSubfolders) result.push(...collectBookmarks(child, true));
  }
  return result;
}

type SystemFolder = 'bookmarks-bar' | 'other';

/** Chrome's classic ids; other browsers and account bookmarks (Chrome signed in with bookmarks in the account) differ */
const CLASSIC_IDS: Record<SystemFolder, string> = {'bookmarks-bar': BOOKMARKS_BAR_ID, other: '2'};

/**
 * The browser's own folder of that type: by folderType (Chrome 134+), else by the classic id.
 * With both a local and an account copy, the one with bookmarks wins, then the synced one.
 * null — the browser has no such folder
 */
export async function findSystemFolder(type: SystemFolder): Promise<string | null> {
  const roots = (await chrome.bookmarks.getChildren(ROOT_FOLDER_ID)).filter((node) => !node.url);
  const typed = roots.filter((node) => node.folderType === type);
  if (typed.length > 0) {
    const counts = await Promise.all(typed.map(async (node) => (await chrome.bookmarks.getChildren(node.id)).length));
    const ranked = typed
      .map((node, index) => ({node, filled: counts[index] > 0}))
      .sort((a, b) => Number(b.filled) - Number(a.filled) || Number(b.node.syncing) - Number(a.node.syncing));
    return ranked[0].node.id;
  }
  return roots.find((node) => node.id === CLASSIC_IDS[type])?.id ?? null;
}

/** Somewhere a bookmark can be put when no folder is given: the bar, "Other bookmarks" or any top-level folder */
export async function fallbackFolder(): Promise<string | null> {
  return await findSystemFolder('bookmarks-bar')
    ?? await findSystemFolder('other')
    ?? (await chrome.bookmarks.getChildren(ROOT_FOLDER_ID)).find((node) => !node.url)?.id
    ?? null;
}

/** A folder that exists (not a bookmark, not the root) — otherwise null */
export async function existingFolder(folderId: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  try {
    const [folder] = await chrome.bookmarks.get(folderId);
    return folder && !folder.url && folder.parentId !== undefined ? folder : null;
  } catch {
    return null;
  }
}

export async function getFolderOptions(): Promise<FolderOption[]> {
  const [root] = await chrome.bookmarks.getTree();
  return flattenFolders(root);
}
