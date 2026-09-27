// Numbers for the toolbar popup: sites and folders in all bookmarks, and how many of the sites don't work
interface TreeNode {
  id: string;
  url?: string;
  children?: TreeNode[];
}

export interface BookmarkStats {
  sites: number;
  /** The user's folders — not the root and the browser's own top-level folders (bar, "Other bookmarks") */
  folders: number;
  /** Sites with a "doesn't work" mark from the link check */
  broken: number;
}

export function bookmarkStats(root: TreeNode, brokenIds: ReadonlySet<string>): BookmarkStats {
  const stats: BookmarkStats = {sites: 0, folders: 0, broken: 0};
  const visit = (node: TreeNode, depth: number) => {
    if (node.url) {
      stats.sites++;
      if (brokenIds.has(node.id)) stats.broken++;
      return;
    }
    if (depth > 1) stats.folders++;
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  visit(root, 0);
  return stats;
}
