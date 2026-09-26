// Bookmarks marked as not working: bookmark id → what was wrong. In chrome.storage.local, so every tab
// and the service worker see the same marks. No Svelte
import type {LinkProblem} from './linkCheck';

const STORAGE_KEY = 'brokenLinks';

export interface BrokenMark {
  problem: LinkProblem;
  status?: number;
  checkedAt: number;
}

export type BrokenMarks = Record<string, BrokenMark>;

export async function loadBrokenMarks(): Promise<BrokenMarks> {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  return stored && typeof stored === 'object' ? stored as BrokenMarks : {};
}

async function update(change: (marks: BrokenMarks) => boolean): Promise<void> {
  const marks = await loadBrokenMarks();
  if (change(marks)) await chrome.storage.local.set({[STORAGE_KEY]: marks});
}

export function addBrokenMarks(entries: Record<string, BrokenMark>): Promise<void> {
  return update((marks) => {
    Object.assign(marks, entries);
    return Object.keys(entries).length > 0;
  });
}

/** Removing a mark that isn't there costs nothing — no write */
export function removeBrokenMarks(ids: string[]): Promise<void> {
  return update((marks) => {
    const present = ids.filter((id) => id in marks);
    present.forEach((id) => delete marks[id]);
    return present.length > 0;
  });
}

export function onBrokenMarksChanged(callback: (marks: BrokenMarks) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_KEY in changes) callback((changes[STORAGE_KEY].newValue as BrokenMarks | undefined) ?? {});
  });
}
