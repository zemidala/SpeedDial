// Список папок для выпадающих меню: дерево в плоском виде с отступами и количеством закладок

export interface FolderOption {
  id: string;
  title: string;
  depth: number;
  /** Закладок непосредственно в папке, без вложенных */
  bookmarkCount: number;
}

interface TreeNode {
  id: string;
  title: string;
  url?: string;
  children?: TreeNode[];
}

/** Папки дерева в порядке обхода; корень (без названия) не включается */
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

/** Все закладки папки; с includeSubfolders — и из вложенных папок */
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
