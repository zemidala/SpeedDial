// Marks of not working bookmarks for the page: tiles show a placeholder icon instead of the site's
import {SvelteMap} from 'svelte/reactivity';
import {
  addBrokenMarks,
  type BrokenMark,
  type BrokenMarks,
  loadBrokenMarks,
  onBrokenMarksChanged,
  removeBrokenMarks,
} from './brokenLinks';
import {t} from './i18n/index.svelte';
import type {LinkProblem} from './linkCheck';

/** What's wrong with the link, for people: "Page not found (404)", "The site doesn't respond"… */
export function describeProblem(problem: LinkProblem, status?: number): string {
  if (problem === 'notFound') return t.linkCheck.notFound(status ?? 404);
  if (problem === 'serverError') return t.linkCheck.serverError(status ?? 500);
  return t.linkCheck.unreachable;
}

class BrokenLinksStore {
  #marks = new SvelteMap<string, BrokenMark>();

  start(): void {
    loadBrokenMarks().then((marks) => this.#replace(marks)).catch((error) => console.error('Failed to load link marks', error));
    // Marks set in another tab or removed by the service worker
    onBrokenMarksChanged((marks) => this.#replace(marks));
  }

  get(id: string): BrokenMark | undefined {
    return this.#marks.get(id);
  }

  async mark(entries: Record<string, BrokenMark>): Promise<void> {
    Object.entries(entries).forEach(([id, mark]) => this.#marks.set(id, mark));
    await addBrokenMarks(entries);
  }

  async unmark(ids: string[]): Promise<void> {
    ids.forEach((id) => this.#marks.delete(id));
    await removeBrokenMarks(ids);
  }

  #replace(marks: BrokenMarks): void {
    for (const id of this.#marks.keys()) if (!(id in marks)) this.#marks.delete(id);
    for (const [id, mark] of Object.entries(marks)) this.#marks.set(id, mark);
  }
}

export const brokenLinks = new BrokenLinksStore();
