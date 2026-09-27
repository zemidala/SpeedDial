// Checks that the browser has loaded the current manifest.json.
// For an unpacked extension, pages and scripts are read from disk right away, while the manifest is read only
// when the extension is reloaded. After the files change, new code may run against the old manifest
// and, for example, request permissions the browser doesn't know about yet

// Fields the extension's behaviour depends on. Not the version: it changes with every build (see vite.config.ts),
// and a new version alone needs no reload
const RELEVANT_KEYS = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
  'background',
  'chrome_url_overrides',
] as const;

/** JSON with sorted keys: the browser may return manifest fields in a different order */
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

/** true — the manifest file on disk differs from the one loaded in the browser */
export async function isManifestOutdated(): Promise<boolean> {
  const response = await fetch(chrome.runtime.getURL('manifest.json'), {cache: 'no-store'});
  const onDisk = await response.json() as Record<string, unknown>;
  const loaded = chrome.runtime.getManifest() as unknown as Record<string, unknown>;
  return relevantManifestFields(onDisk) !== relevantManifestFields(loaded);
}
