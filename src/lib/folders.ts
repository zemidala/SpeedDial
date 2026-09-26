// Folder list for dropdowns: the tree flattened with indentation and bookmark counts

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

export async function getFolderOptions(): Promise<FolderOption[]> {
  const [root] = await chrome.bookmarks.getTree();
  return flattenFolders(root);
}
