// Suggestions of the search engine for the search box, as in the browser's address bar. The services answer in the
// OpenSearch suggestions format: [query, [suggestion, …], …]. Needs SUGGEST_ACCESS (permissionSets.ts)
import type {SearchEngine} from './settings/schema';

export const MAX_SUGGESTIONS = 8;

/** The suggestion service address of an engine; a custom search address has none */
export function suggestUrl(engine: SearchEngine, query: string, language: string): string | null {
  const q = encodeURIComponent(query.trim());
  switch (engine) {
    case 'google':
      // ie/oe: without them Google answers in the locale's legacy encoding (e.g. windows-1251 for Russian)
      return `https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&hl=${language}&q=${q}`;
    case 'bing':
      return `https://api.bing.com/osjson.aspx?query=${q}`;
    case 'duckduckgo':
      return `https://duckduckgo.com/ac/?type=list&q=${q}`;
    case 'custom':
      return null;
  }
}

/** Suggestions from an OpenSearch answer: text only, no repeats and not the query itself */
export function parseSuggestions(data: unknown, query: string): string[] {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  const typed = query.trim().toLowerCase();
  const seen = new Set<string>([typed]);
  const suggestions: string[] = [];
  for (const item of data[1]) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(text);
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return suggestions;
}

/** Asks the engine; an error or no answer gives no suggestions — the search box works as before */
export async function fetchSuggestions(
  engine: SearchEngine,
  query: string,
  language: string,
  signal: AbortSignal,
): Promise<string[]> {
  const url = suggestUrl(engine, query, language);
  if (!url || !query.trim()) return [];
  try {
    const response = await fetch(url, {signal, credentials: 'omit'});
    if (!response.ok) return [];
    return parseSuggestions(await response.json(), query);
  } catch {
    return [];
  }
}
