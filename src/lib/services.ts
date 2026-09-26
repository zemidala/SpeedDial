// The service list in the settings is edited as text: one "Name | URL" per line
import type {ServiceLink} from './settings/schema';
import {normalizeUrl} from './url';

export function formatServices(services: ServiceLink[]): string {
  return services.map(({title, url}) => `${title} | ${url}`).join('\n');
}

/** Parses the text; lines without a valid URL are skipped */
export function parseServices(text: string): ServiceLink[] {
  const services: ServiceLink[] = [];
  for (const line of text.split('\n')) {
    const separator = line.lastIndexOf('|');
    const title = (separator >= 0 ? line.slice(0, separator) : '').trim();
    const url = normalizeUrl(separator >= 0 ? line.slice(separator + 1) : line);
    if (url) services.push({title: title || new URL(url).hostname, url});
  }
  return services;
}
