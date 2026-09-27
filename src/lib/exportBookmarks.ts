// Saving some bookmarks and folders (with everything inside) as a bookmarks file — SpeedDial or any browser imports it
import {bookmarksToHtml} from './bookmarksHtml';
import {downloadBlob} from './files';

/** A file name from a folder name: without characters Windows and macOS don't allow */
export function exportFileName(title: string, date = new Date()): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${safe || 'bookmarks'} ${date.toISOString().slice(0, 10)}.html`;
}

function countBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.url ? 1 : countBookmarks(node.children ?? [])), 0);
}

/** Saves the items in the given order; returns how many bookmarks went into the file */
export async function exportBookmarks(ids: string[], fileTitle: string): Promise<number> {
  const nodes = (await Promise.all(ids.map((id) => chrome.bookmarks.getSubTree(id)))).flat();
  // No folder is marked as the bookmarks bar: importing the file shouldn't mix it into the browser's own bar
  const html = bookmarksToHtml(nodes, false);
  downloadBlob(exportFileName(fileTitle), new Blob([html], {type: 'text/html'}));
  return countBookmarks(nodes);
}
