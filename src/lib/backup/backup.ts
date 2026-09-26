// Резервная копия SpeedDial: настройки, закладки с порядком и (по желанию) миниатюры и фон.
// Без Svelte — используется и в service worker (автоматические копии)
import {t} from '../i18n/index.svelte';
import {idbGet, idbSet} from '../idb';
import {LOCAL_KEYS, type Settings, splitSettings} from '../settings/schema';
import {loadSettings} from '../settings/storage';
import {getThumbnail, saveThumbnail, type ThumbnailSource} from '../thumbnails/storage';

export const BACKUP_FORMAT = 'speeddial-backup';
export const BACKUP_VERSION = 1;
/** Ключ фонового изображения в хранилище files — тот же, что у background.svelte.ts */
export const BACKGROUND_FILE_KEY = 'background';

export interface BackupImage {
  type: string;
  /** Содержимое в base64 */
  data: string;
}

export interface BackupNode {
  title: string;
  /** Нет у папок */
  url?: string;
  children?: BackupNode[];
  thumbnail?: BackupImage & {source: ThumbnailSource};
}

/** Корневая папка браузера: «Панель закладок», «Другие закладки»… */
export interface BackupRoot {
  id: string;
  title: string;
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

/** Нужная часть chrome.bookmarks — в тестах подменяется */
export interface BookmarksApi {
  getTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  getChildren(id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  create(details: chrome.bookmarks.CreateDetails): Promise<chrome.bookmarks.BookmarkTreeNode>;
  removeTree(id: string): Promise<void>;
}

// ===== base64 без FileReader: его нет в service worker =====

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

// ===== Создание копии =====

async function toBackupNode(node: chrome.bookmarks.BookmarkTreeNode, withImages: boolean): Promise<BackupNode> {
  const result: BackupNode = {title: node.title};
  if (node.url !== undefined) {
    result.url = node.url;
    const thumbnail = withImages ? await getThumbnail(node.id).catch(() => undefined) : undefined;
    if (thumbnail) result.thumbnail = {...await blobToImage(thumbnail.blob), source: thumbnail.source};
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
    roots.push({id: folder.id, title: folder.title, children});
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

/** Отпечаток содержимого без времени создания: одинаковые копии подряд не выгружаются */
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

/** Настройки из копии поверх текущих; настройки этого устройства сохраняются */
export function settingsFromBackup(backup: Backup, current: Settings): Record<string, unknown> {
  const restored: Record<string, unknown> = {...backup.settings};
  for (const key of LOCAL_KEYS) restored[key] = current[key];
  return restored;
}

// ===== Восстановление закладок =====

export interface RestoreResult {
  /** Созданные закладки и папки */
  created: number;
  /** Восстановленные миниатюры */
  thumbnails: number;
}

/** Место в браузере для корневой папки из копии: по id, иначе по порядку */
function matchRoot(roots: chrome.bookmarks.BookmarkTreeNode[], backupRoot: BackupRoot, index: number) {
  return roots.find((root) => root.id === backupRoot.id) ?? roots[index];
}

/** Закладка совпадает по адресу, папка — по названию */
function sameNode(existing: chrome.bookmarks.BookmarkTreeNode, node: BackupNode): boolean {
  if (node.url !== undefined) return existing.url === node.url;
  return existing.url === undefined && existing.title === node.title;
}

/**
 * Восстанавливает закладки из копии.
 * merge — добавляет недостающее (закладки по адресу, папки по названию), ничего не удаляя;
 * replace — содержимое корневых папок становится точно таким, как в копии.
 * saveImage сохраняет миниатюру для созданной или найденной закладки
 */
export async function restoreBookmarks(
  backup: Backup,
  mode: RestoreMode,
  api: BookmarksApi = chrome.bookmarks,
  saveImage: (id: string, thumbnail: NonNullable<BackupNode['thumbnail']>) => Promise<boolean> = saveThumbnailIfMissing,
): Promise<RestoreResult> {
  const result: RestoreResult = {created: 0, thumbnails: 0};
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

  const merge = async (nodes: BackupNode[], parentId: string) => {
    const existing = await api.getChildren(parentId);
    for (const node of nodes) {
      const match = existing.find((item) => sameNode(item, node));
      if (!match) {
        await create(node, parentId);
      } else if (node.url !== undefined) {
        await restoreImage(match.id, node);
      } else {
        await merge(node.children ?? [], match.id);
      }
    }
  };

  for (const [index, backupRoot] of backup.roots.entries()) {
    const root = matchRoot(roots, backupRoot, index);
    if (!root) continue;
    if (mode === 'replace') {
      for (const child of await api.getChildren(root.id)) await api.removeTree(child.id);
      for (const node of backupRoot.children) await create(node, root.id);
    } else {
      await merge(backupRoot.children, root.id);
    }
  }
  return result;
}

/** Миниатюра из копии; своя миниатюра закладки не перезаписывается */
async function saveThumbnailIfMissing(id: string, thumbnail: NonNullable<BackupNode['thumbnail']>): Promise<boolean> {
  if (await getThumbnail(id).catch(() => undefined)) return false;
  await saveThumbnail(id, imageToBlob(thumbnail), thumbnail.source);
  return true;
}

/** Фоновое изображение из копии */
export async function restoreBackground(backup: Backup): Promise<boolean> {
  if (!backup.background) return false;
  await idbSet('files', BACKGROUND_FILE_KEY, imageToBlob(backup.background));
  return true;
}

export function backupFileName(now = new Date()): string {
  // 2026-09-26T12:30:05.123Z → speeddial-2026-09-26_12-30-05.json (двоеточия в именах файлов недопустимы)
  const stamp = now.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  return `speeddial-${stamp}.json`;
}
