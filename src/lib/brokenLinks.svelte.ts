// Marks of not working bookmarks for the page: tiles show a placeholder icon instead of the site's
import {type BrokenMark, brokenLinkStorage} from './brokenLinks';
import {t} from './i18n/index.svelte';
import type {LinkProblem} from './linkCheck';
import {PerBookmarkStore} from './perBookmark.svelte';

/** What's wrong with the link, for people: "Page not found (404)", "The site doesn't respond"… */
export function describeProblem(problem: LinkProblem, status?: number): string {
  if (problem === 'notFound') return t.linkCheck.notFound(status ?? 404);
  if (problem === 'serverError') return t.linkCheck.serverError(status ?? 500);
  return t.linkCheck.unreachable;
}

class BrokenLinksStore extends PerBookmarkStore<BrokenMark> {
  constructor() {
    super(brokenLinkStorage);
  }

  mark(marks: Record<string, BrokenMark>): Promise<void> {
    return this.setMany(marks);
  }

  unmark(ids: string[]): Promise<void> {
    return this.setMany(Object.fromEntries(ids.map((id) => [id, null])));
  }
}

export const brokenLinks = new BrokenLinksStore();
