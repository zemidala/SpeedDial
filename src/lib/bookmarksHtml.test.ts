import {describe, expect, it} from 'vitest';
import {existingLinks, planImport, runImport} from './bookmarkImport';
import {bookmarksToHtml, parseBookmarksHtml} from './bookmarksHtml';

// Shortened from a real Chrome export: unclosed <DT> and <p>, entities, the bookmarks bar marker
const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="0" PERSONAL_TOOLBAR_FOLDER="true">Панель закладок</H3>
    <DL><p>
        <DT><A HREF="https://example.com/?a=1&amp;b=2" ADD_DATE="1700000001" ICON="data:image/png;base64,AAA">Tom &amp; Jerry &#8212; &quot;cartoon&quot;</A>
        <DT><H3 ADD_DATE="1700000002">Работа</H3>
        <DL><p>
            <DT><A HREF="https://docs.example/">Docs</A>
            <DT><H3>Пустая</H3>
            <DL><p>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://other.example/">Other</A>
</DL><p>
`;

// Firefox: lowercase tags, a description list (<DD>), smart folders with place: links
const FIREFOX_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Bookmarks</title>
<h1>Bookmarks Menu</h1>
<dl><p>
  <dt><h3 add_date="1690000000">Mozilla Firefox</h3>
  <dl><p>
    <dt><a href="https://support.mozilla.org/" add_date="1690000000000000">Get Help</a>
    <dd>A description
    <dt><a href="place:sort=8&maxResults=10">Recently visited</a>
  </dl><p>
</dl>
`;

describe('parseBookmarksHtml', () => {
  it('reads folders, bookmarks, entities and dates from a Chrome export', () => {
    expect(parseBookmarksHtml(CHROME_EXPORT)).toEqual([
      {title: 'Панель закладок', dateAdded: 1_700_000_000_000, children: [
        {title: 'Tom & Jerry — "cartoon"', url: 'https://example.com/?a=1&b=2', dateAdded: 1_700_000_001_000},
        {title: 'Работа', dateAdded: 1_700_000_002_000, children: [
          {title: 'Docs', url: 'https://docs.example/'},
          {title: 'Пустая', children: []},
        ]},
      ]},
      {title: 'Other', url: 'https://other.example/'},
    ]);
  });

  it('reads a Firefox export; dates in microseconds', () => {
    const [folder] = parseBookmarksHtml(FIREFOX_EXPORT);
    expect(folder.title).toBe('Mozilla Firefox');
    expect(folder.children).toEqual([
      {title: 'Get Help', url: 'https://support.mozilla.org/', dateAdded: 1_690_000_000_000},
      {title: 'Recently visited', url: 'place:sort=8&maxResults=10'},
    ]);
  });

  it('rejects files that aren\'t bookmarks', () => {
    expect(() => parseBookmarksHtml('<html><body>Hello</body></html>')).toThrow();
    expect(() => parseBookmarksHtml('{"format": "speeddial-backup"}')).toThrow();
  });
});

describe('bookmarksToHtml', () => {
  it('writes a file that reads back the same', () => {
    const tree = [
      {id: '1', title: 'Bar <main>', dateAdded: 1_700_000_000_000, children: [
        {id: '5', title: 'A & "B"', url: 'https://example.com/?a=1&b=2', dateAdded: 1_700_000_001_000},
        {id: '6', title: 'Empty', children: []},
      ]},
      {id: '2', title: 'Other', children: [{id: '7', title: 'C', url: 'https://c.example/'}]},
    ];
    const html = bookmarksToHtml(tree);
    expect(html).toContain('PERSONAL_TOOLBAR_FOLDER="true">Bar &lt;main&gt;</H3>');
    expect(html.match(/PERSONAL_TOOLBAR_FOLDER/g)).toHaveLength(1);
    expect(parseBookmarksHtml(html)).toEqual([
      {title: 'Bar <main>', dateAdded: 1_700_000_000_000, children: [
        {title: 'A & "B"', url: 'https://example.com/?a=1&b=2', dateAdded: 1_700_000_001_000},
        {title: 'Empty', children: []},
      ]},
      {title: 'Other', children: [{title: 'C', url: 'https://c.example/'}]},
    ]);
  });
});

describe('planImport', () => {
  const nodes = parseBookmarksHtml(CHROME_EXPORT);

  it('skips links that already exist and folders left empty', () => {
    const existing = existingLinks([{children: [{url: 'http://www.docs.example'}]}]);
    const plan = planImport(nodes, existing);
    expect(plan).toMatchObject({bookmarks: 2, folders: 1, duplicates: 1});
    expect(plan.nodes.map((node) => node.title)).toEqual(['Панель закладок', 'Other']);
    expect(plan.nodes[0].children!.map((node) => node.title)).toEqual(['Tom & Jerry — "cartoon"']);
  });

  it('skips repeats inside the file; without the check imports everything', () => {
    const repeated = [...nodes, {title: 'Again', url: 'https://other.example'}];
    expect(planImport(repeated, new Set())).toMatchObject({bookmarks: 3, duplicates: 1});
    expect(planImport(repeated, null)).toMatchObject({bookmarks: 4, folders: 2, duplicates: 0});
  });

  it('leaves out Firefox smart folders', () => {
    const plan = planImport(parseBookmarksHtml(FIREFOX_EXPORT), null);
    expect(plan).toMatchObject({bookmarks: 1, folders: 1});
  });
});

describe('runImport', () => {
  it('creates the tree in order inside a new folder', async () => {
    const created: {id: string; parentId?: string; title?: string; url?: string}[] = [];
    const api = {
      create: async (details: {parentId?: string; title?: string; url?: string}) => {
        const node = {...details, id: String(100 + created.length)};
        created.push(node);
        return node as chrome.bookmarks.BookmarkTreeNode;
      },
    } as Pick<typeof chrome.bookmarks, 'create'>;
    const progress: number[] = [];

    const folderId = await runImport(
      planImport(parseBookmarksHtml(CHROME_EXPORT), null),
      {parentId: '1', folderTitle: 'Imported'},
      (done) => progress.push(done),
      api,
    );

    expect(folderId).toBe('100');
    expect(created.map(({id, parentId, title, url}) => [id, parentId, title, url ?? null])).toEqual([
      ['100', '1', 'Imported', null],
      ['101', '100', 'Панель закладок', null],
      ['102', '101', 'Tom & Jerry — "cartoon"', 'https://example.com/?a=1&b=2'],
      ['103', '101', 'Работа', null],
      ['104', '103', 'Docs', 'https://docs.example/'],
      ['105', '100', 'Other', 'https://other.example/'],
    ]);
    expect(progress).toEqual([1, 2, 3]);
  });
});
