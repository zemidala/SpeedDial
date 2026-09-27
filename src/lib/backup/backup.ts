// SpeedDial backup: settings, bookmarks with their order and (optionally) thumbnails and background.
// No Svelte — also used by the service worker (automatic backups)
import {planMerge, rootKind, type RootKind, runMerge} from '../bookmarkMerge';
import {t} from '../i18n/index.svelte';
import {idbGet, idbSet} from '../idb';
import {LOCAL_KEYS, type Settings, splitSettings} from '../settings/schema';
import {loadSettings} from '../settings/storage';
import {getThumbnail, saveThumbnail, type ThumbnailSource} from '../thumbnails/storage';

export const BACKUP_FORMAT = 'speeddial-backup';
export const BACKUP_VERSION = 1;
/** Key of the background image in the files store — the same as in background.svelte.ts */
export const BACKGROUND_FILE_KEY = 'background';

export interface BackupImage {
  type: string;
  /** Contents in base64 */
  data: string;
}

export interface BackupNode {
  title: string;
  /** Absent for folders */
  url?: string;
  children?: BackupNode[];
  thumbnail?: BackupImage & {source: ThumbnailSource};
}

/** A browser root folder: bookmarks bar, other bookmarks… */
export interface BackupRoot {
  id: string;
  title: string;
  /** Which root it is — matched by this in another browser; absent in older backups (then by the classic id) */
  kind?: RootKind | null;
  children: BackupNode[];
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  settings: Partial<Settings>;
  roots: BackupRoot[];
  background?: BackupImage;
}

export type RestoreMode = 'merge' | 'replace';

/** The part of chrome.bookmarks we need — replaced in tests */
export interface BookmarksApi {
  getTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  getChildren(id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  create(details: chrome.bookmarks.CreateDetails): Promise<chrome.bookmarks.BookmarkTreeNode>;
  removeTree(id: string): Promise<void>;
}

// ===== base64 without FileReader: the service worker doesn't have it =====

export async function blobToImage(blob: Blob): Promise<BackupImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return {type: blob.type, data: btoa(binary)};
}

export function imageToBlob(image: BackupImage): Blob {
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {type: image.type});
}

// ===== Creating a backup =====

async function toBackupNode(node: chrome.bookmarks.BookmarkTreeNode, withImages: boolean): Promise<BackupNode> {
  const result: BackupNode = {title: node.title};
  // A bookmark's thumbnail, or a folder's own picture
  const thumbnail = withImages ? await getThumbnail(node.id).catch(() => undefined) : undefined;
  if (thumbnail) result.thumbnail = {...await blobToImage(thumbnail.blob), source: thumbnail.source};
  if (node.url !== undefined) {
    result.url = node.url;
  } else {
    result.children = [];
    for (const child of node.children ?? []) result.children.push(await toBackupNode(child, withImages));
  }
  return result;
}

export async function createBackup(
  {includeImages}: {includeImages: boolean},
  api: BookmarksApi = chrome.bookmarks,
  settings?: Settings,
  now = new Date(),
): Promise<Backup> {
  const [root] = await api.getTree();
  const roots: BackupRoot[] = [];
  for (const folder of root.children ?? []) {
    const {children = []} = await toBackupNode(folder, includeImages);
    roots.push({id: folder.id, title: folder.title, kind: rootKind(folder), children});
  }

  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    settings: splitSettings(settings ?? await loadSettings()).shared,
    roots,
  };
  if (includeImages) {
    const image = await idbGet<Blob>('files', BACKGROUND_FILE_KEY).catch(() => undefined);
    if (image) backup.background = await blobToImage(image);
  }
  return backup;
}

/** Fingerprint of the contents without the creation time: identical consecutive backups aren't uploaded */
export async function backupFingerprint(backup: Backup): Promise<string> {
  const content = {...backup, createdAt: ''};
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseBackup(text: string): Backup {
  let backup: Partial<Backup>;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error(t.cloudErrors.backupNotJson);
  }
  if (backup?.format !== BACKUP_FORMAT || !Array.isArray(backup.roots)) {
    throw new Error(t.cloudErrors.notBackup);
  }
  if ((backup.version ?? 0) > BACKUP_VERSION) {
    throw new Error(t.cloudErrors.newerVersion);
  }
  return {...backup, settings: backup.settings ?? {}} as Backup;
}

/** Settings from the backup over the current ones; device-only settings are kept */
export function settingsFromBackup(backup: Backup, current: Settings): Record<string, unknown> {
  const restored: Record<string, unknown> = {...backup.settings};
  for (const key of LOCAL_KEYS) restored[key] = current[key];
  return restored;
}

// ===== Restoring bookmarks =====

export interface RestoreResult {
  /** Created bookmarks and folders */
  created: number;
  /** Top-level created nodes (merge): removing them undoes it */
  createdIds: string[];
  /** Restored thumbnails */
  thumbnails: number;
}

const kindOf = (backupRoot: BackupRoot) => backupRoot.kind ?? rootKind({id: backupRoot.id});

/** Where a backup root folder goes in the browser: the same kind (another browser's ids differ), the id, the position */
function matchRoot(roots: chrome.bookmarks.BookmarkTreeNode[], backupRoot: BackupRoot, index: number) {
  const kind = kindOf(backupRoot);
  return (kind ? roots.find((root) => rootKind(root) === kind) : undefined)
    ?? roots.find((root) => root.id === backupRoot.id) ?? roots[index];
}

/**
 * Restores bookmarks from a backup.
 * merge — adds what's missing and deletes nothing: roots by kind, same-named folders merge, a bookmark whose address
 * is already in that folder is skipped (see bookmarkMerge.ts);
 * replace — root folder contents become exactly as in the backup.
 * saveImage stores the thumbnail of a created or matched bookmark
 */
export async function restoreBookmarks(
  backup: Backup,
  mode: RestoreMode,
  api: BookmarksApi = chrome.bookmarks,
  saveImage: (id: string, thumbnail: NonNullable<BackupNode['thumbnail']>) => Promise<boolean> = saveThumbnailIfMissing,
): Promise<RestoreResult> {
  const result: RestoreResult = {created: 0, createdIds: [], thumbnails: 0};
  const [tree] = await api.getTree();
  const roots = tree.children ?? [];

  const restoreImage = async (id: string, node: BackupNode) => {
    if (node.thumbnail && await saveImage(id, node.thumbnail)) result.thumbnails++;
  };

  const create = async (node: BackupNode, parentId: string) => {
    const created = await api.create({parentId, title: node.title, url: node.url});
    result.created++;
    await restoreImage(created.id, node);
    for (const child of node.children ?? []) await create(child, created.id);
  };

  if (mode === 'merge') {
    const plan = planMerge(backup.roots.map((root) => ({kind: kindOf(root), children: root.children})), tree);
    // Bookmarks already here get the backup's thumbnail if they have none
    for (const {id, node} of plan.matched) await restoreImage(id, node);
    result.createdIds = await runMerge(plan, api, async (id, node) => {
      result.created++;
      await restoreImage(id, node);
    });
    return result;
  }

  for (const [index, backupRoot] of backup.roots.entries()) {
    const root = matchRoot(roots, backupRoot, index);
    if (!root) continue;
    for (const child of await api.getChildren(root.id)) await api.removeTree(child.id);
    for (const node of backupRoot.children) await create(node, root.id);
  }
  return result;
}

/** Thumbnail from the backup; a bookmark's own thumbnail isn't overwritten */
async function saveThumbnailIfMissing(id: string, thumbnail: NonNullable<BackupNode['thumbnail']>): Promise<boolean> {
  if (await getThumbnail(id).catch(() => undefined)) return false;
  await saveThumbnail(id, imageToBlob(thumbnail), thumbnail.source);
  return true;
}

/** Background image from the backup */
export async function restoreBackground(backup: Backup): Promise<boolean> {
  if (!backup.background) return false;
  await idbSet('files', BACKGROUND_FILE_KEY, imageToBlob(backup.background));
  return true;
}

export function backupFileName(now = new Date()): string {
  // 2026-09-26T12:30:05.123Z → speeddial-2026-09-26_12-30-05.json (colons aren't allowed in file names)
  const stamp = now.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  return `speeddial-${stamp}.json`;
}
