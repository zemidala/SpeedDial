// The browsers' bookmarks file (the Netscape format): what Chrome, Edge, Firefox, Opera, Safari and Yandex Browser
// save with "Export bookmarks" and open with "Import bookmarks". No DOM — a small tag scanner, covered by unit tests
import {type MergeRoot, rootKind} from './bookmarkMerge';

export interface HtmlBookmark {
  title: string;
  /** Absent for folders */
  url?: string;
  /** Milliseconds */
  dateAdded?: number;
  children?: HtmlBookmark[];
  /** The browser's bookmarks bar (PERSONAL_TOOLBAR_FOLDER) */
  toolbar?: boolean;
  /** "Other bookmarks" as Firefox and SpeedDial mark it (UNFILED_BOOKMARKS_FOLDER) */
  unfiled?: boolean;
}

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Seconds since 1970 in ADD_DATE; some browsers write microseconds */
function parseDate(value: string | undefined): number | undefined {
  const number = Number(value);
  if (!value || !Number.isFinite(number) || number <= 0) return undefined;
  return number > 1e14 ? Math.round(number / 1000) : number * 1000;
}

/** Folders and bookmarks of the file; throws if it isn't a bookmarks file */
export function parseBookmarksHtml(html: string): HtmlBookmark[] {
  const root: HtmlBookmark = {title: '', children: []};
  const stack: HtmlBookmark[] = [root];
  // A folder heading whose <DL> list hasn't started yet
  let pendingFolder: HtmlBookmark | null = null;
  let recognized = false;

  const tags = /<(\/?)(dl|h3|a)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tags.exec(html))) {
    const [, closing, name, attributeSource] = match;
    const tag = name.toLowerCase();
    const current = stack.at(-1)!;

    if (tag === 'dl') {
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        recognized = true;
        // A list after a heading holds that folder's contents; any other list (the file's top one) — the current folder's
        stack.push(pendingFolder ?? current);
        pendingFolder = null;
      }
      continue;
    }
    if (closing) continue;

    // The element's text: up to its closing tag
    const end = html.slice(tags.lastIndex).search(new RegExp(`</${tag}\\s*>`, 'i'));
    if (end < 0) continue;
    const text = decodeEntities(html.slice(tags.lastIndex, tags.lastIndex + end).replace(/<[^>]*>/g, '')).trim();
    tags.lastIndex += end;
    const attributes = parseAttributes(attributeSource);
    const dateAdded = parseDate(attributes.add_date);

    if (tag === 'h3') {
      pendingFolder = {
        title: text,
        children: [],
        ...(dateAdded ? {dateAdded} : {}),
        ...(attributes.personal_toolbar_folder === 'true' ? {toolbar: true} : {}),
        ...(attributes.unfiled_bookmarks_folder === 'true' ? {unfiled: true} : {}),
      };
      current.children!.push(pendingFolder);
    } else if (attributes.href) {
      pendingFolder = null;
      current.children!.push({title: text, url: attributes.href, ...(dateAdded ? {dateAdded} : {})});
    }
  }

  if (!recognized) throw new Error('Not a bookmarks file');
  return root.children!;
}

/**
 * The file's top level as the browser's root folders, for merging: the marked bar goes to the bar; "Other bookmarks"
 * (marked, or — as Chrome and Edge write them — loose at the top level) and any other top-level folder go to "Other"
 */
export function htmlMergeRoots(nodes: HtmlBookmark[]): MergeRoot<HtmlBookmark>[] {
  const bar = nodes.find((node) => node.toolbar && node.url === undefined);
  const other: HtmlBookmark[] = [];
  for (const node of nodes) {
    if (node === bar) continue;
    if (node.unfiled && node.url === undefined) other.push(...(node.children ?? []));
    else other.push(node);
  }
  return [
    ...(bar ? [{kind: 'bookmarks-bar' as const, children: bar.children ?? []}] : []),
    ...(other.length > 0 ? [{kind: 'other' as const, children: other}] : []),
  ];
}

interface ExportNode {
  id?: string;
  folderType?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: ExportNode[];
}

/**
 * A bookmarks file any browser can import. markRoots — the browser's root folders at the top level are marked:
 * the bar so browsers put it back in its place, "Other bookmarks" so SpeedDial and Firefox merge it into theirs.
 * A file of chosen folders marks nothing: importing it shouldn't mix it into the browser's own bar
 */
export function bookmarksToHtml(roots: ExportNode[], markRoots = true): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const date = (node: ExportNode) => (node.dateAdded ? ` ADD_DATE="${Math.floor(node.dateAdded / 1000)}"` : '');

  const write = (nodes: ExportNode[], depth: number) => {
    const indent = '    '.repeat(depth);
    for (const node of nodes) {
      if (node.url !== undefined) {
        lines.push(`${indent}<DT><A HREF="${escapeHtml(node.url)}"${date(node)}>${escapeHtml(node.title)}</A>`);
        continue;
      }
      const kind = markRoots && depth === 1 ? rootKind(node) : null;
      const marker = kind === 'bookmarks-bar' ? ' PERSONAL_TOOLBAR_FOLDER="true"'
        : kind === 'other' ? ' UNFILED_BOOKMARKS_FOLDER="true"' : '';
      lines.push(`${indent}<DT><H3${date(node)}${marker}>${escapeHtml(node.title)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      write(node.children ?? [], depth + 1);
      lines.push(`${indent}</DL><p>`);
    }
  };
  write(roots, 1);
  lines.push('</DL><p>', '');
  return lines.join('\n');
}
