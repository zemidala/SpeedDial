// Bookmarks marked as not working: bookmark id → what was wrong (see perBookmark.ts for how it's stored). No Svelte
import type {LinkProblem} from './linkCheck';
import {perBookmarkStorage} from './perBookmark';

export interface BrokenMark {
  problem: LinkProblem;
  status?: number;
  checkedAt: number;
}

export const brokenLinkStorage = perBookmarkStorage<BrokenMark>('brokenLinks');
