// Проверка, что браузер загрузил текущий manifest.json.
// У распакованного расширения страницы и скрипты читаются с диска сразу, а манифест — только при
// перезагрузке расширения. После обновления файлов новый код может работать со старым манифестом
// и, например, запрашивать разрешения, о которых браузер ещё не знает

// Поля, от которых зависит работа расширения
const RELEVANT_KEYS = [
  'version',
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
  'background',
  'chrome_url_overrides',
] as const;

/** JSON с отсортированными ключами: браузер может вернуть поля манифеста в другом порядке */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function relevantManifestFields(manifest: Record<string, unknown>): string {
  return stableStringify(Object.fromEntries(RELEVANT_KEYS.map((key) => [key, manifest[key] ?? null])));
}

/** true — файл манифеста на диске отличается от загруженного в браузер */
export async function isManifestOutdated(): Promise<boolean> {
  const response = await fetch(chrome.runtime.getURL('manifest.json'), {cache: 'no-store'});
  const onDisk = await response.json() as Record<string, unknown>;
  const loaded = chrome.runtime.getManifest() as unknown as Record<string, unknown>;
  return relevantManifestFields(onDisk) !== relevantManifestFields(loaded);
}
