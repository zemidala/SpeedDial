import {describe, expect, it} from 'vitest';
import {type ExistingNode, folderKey, type MergeNode, type MergeRoot, planMerge, rootKind, runMerge} from './bookmarkMerge';

/** Chrome at work: the bar with a Games folder and a site, "Other bookmarks" */
function workTree(): ExistingNode {
  return {
    id: '0',
    title: '',
    children: [
      {
        id: '1', title: 'Панель закладок', folderType: 'bookmarks-bar', children: [
          {id: '10', title: 'Games', children: [{id: '100', title: 'Steam', url: 'https://store.steampowered.com/'}]},
          {id: '11', title: 'GitHub', url: 'https://github.com'},
        ],
      },
      {id: '2', title: 'Другие закладки', folderType: 'other', children: []},
    ],
  };
}

const site = (title: string, url: string): MergeNode => ({title, url});
const folder = (title: string, ...children: MergeNode[]): MergeNode => ({title, children});

describe('planMerge', () => {
  it('Edge at home into Chrome at work: the bar goes to the bar, same-named folders merge, repeats are skipped', () => {
    // Edge calls the bar differently — it's matched by kind, not by name
    const home: MergeRoot[] = [{
      kind: 'bookmarks-bar',
      children: [
        folder('games', site('Steam', 'http://www.store.steampowered.com'), site('GOG', 'https://gog.com/')),
        site('GitHub', 'https://github.com/'),
        folder('Music', site('Spotify', 'https://open.spotify.com/')),
      ],
    }];
    const plan = planMerge(home, workTree());

    expect(plan.additions).toEqual([
      {parentId: '10', node: site('GOG', 'https://gog.com/')},
      {parentId: '1', node: folder('Music', site('Spotify', 'https://open.spotify.com/'))},
    ]);
    expect(plan).toMatchObject({bookmarks: 2, folders: 1, mergedFolders: 1, duplicates: 2});
    // The matched existing bookmarks are known — their thumbnails can come along
    expect(plan.matched.map((item) => item.id).sort()).toEqual(['100', '11']);
  });

  it('the same site in another folder is kept: only the same folder counts as a repeat', () => {
    const plan = planMerge([{kind: 'bookmarks-bar', children: [folder('Work', site('GitHub', 'https://github.com/'))]}], workTree());
    expect(plan.additions).toEqual([{parentId: '1', node: folder('Work', site('GitHub', 'https://github.com/'))}]);
    expect(plan.duplicates).toBe(0);
  });

  it('repeats within the file are added once; a folder twice in one place becomes one', () => {
    const plan = planMerge([{
      kind: 'bookmarks-bar',
      children: [
        site('A', 'https://a.example/'), site('A again', 'https://a.example'),
        folder('New', site('B', 'https://b.example/')),
        folder('new ', site('B', 'https://b.example/'), site('C', 'https://c.example/')),
      ],
    }], workTree());
    expect(plan.additions).toEqual([
      {parentId: '1', node: site('A', 'https://a.example/')},
      {parentId: '1', node: folder('New', site('B', 'https://b.example/'), site('C', 'https://c.example/'))},
    ]);
    expect(plan).toMatchObject({bookmarks: 3, folders: 1, duplicates: 2});
  });

  it('merges nested folders level by level', () => {
    const tree = workTree();
    tree.children![0].children![0].children!.push({id: '101', title: 'RPG', children: []});
    const plan = planMerge([{kind: 'bookmarks-bar', children: [folder('Games', folder('rpg', site('D4', 'https://diablo4.example/')))]}], tree);
    expect(plan.additions).toEqual([{parentId: '101', node: site('D4', 'https://diablo4.example/')}]);
    expect(plan.mergedFolders).toBe(2);
  });

  it('unknown or missing kinds land in "Other bookmarks"', () => {
    const plan = planMerge([
      {kind: null, children: [site('Loose', 'https://loose.example/')]},
      {kind: 'mobile', children: [site('Phone', 'https://phone.example/')]},
    ], workTree());
    expect(plan.additions.map((item) => item.parentId)).toEqual(['2', '2']);
  });
});

describe('rootKind', () => {
  it('by folderType, else by the classic ids', () => {
    expect(rootKind({id: '7', folderType: 'bookmarks-bar'})).toBe('bookmarks-bar');
    expect(rootKind({id: '2'})).toBe('other');
    expect(rootKind({id: '42'})).toBeNull();
  });
});

describe('folderKey', () => {
  it('ignores case and extra spaces', () => {
    expect(folderKey('  My   Games ')).toBe(folderKey('my games'));
  });
});

describe('runMerge', () => {
  it('creates the additions with their contents and returns the top-level ids to undo', async () => {
    const created: Array<{parentId?: string; title?: string; url?: string}> = [];
    let next = 500;
    const api = {
      create: async (details: chrome.bookmarks.CreateDetails) => {
        created.push(details);
        return {id: String(next++)};
      },
    };
    const seen: string[] = [];
    const plan = planMerge([{kind: 'bookmarks-bar', children: [folder('Music', site('Spotify', 'https://open.spotify.com/'))]}], workTree());
    const ids = await runMerge(plan, api, (id, node) => {
      seen.push(`${id}:${node.title}`);
    });
    expect(created).toEqual([
      {parentId: '1', title: 'Music'},
      {parentId: '500', title: 'Spotify', url: 'https://open.spotify.com/'},
    ]);
    expect(ids).toEqual(['500']);
    expect(seen).toEqual(['500:Music', '501:Spotify']);
  });
});
