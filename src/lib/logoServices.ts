// Third-party icon and logo services. All of them see bookmark domains, so they're off by default
import type {LogoService} from './settings/schema';
import {getHostname, isWebUrl} from './url';

export interface LogoServiceInfo {
  name: string;
  /** {{website}} — the site domain, {{token}} — the access key */
  template: string;
}

export const LOGO_SERVICES: Record<Exclude<LogoService, 'none' | 'custom'>, LogoServiceInfo> = {
  google: {
    name: 'Google',
    template: 'https://www.google.com/s2/favicons?domain={{website}}&sz=256',
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    template: 'https://icons.duckduckgo.com/ip3/{{website}}.ico',
  },
  iconhorse: {
    name: 'icon.horse',
    template: 'https://icon.horse/icon/{{website}}',
  },
  logodev: {
    name: 'logo.dev',
    template: 'https://img.logo.dev/{{website}}?token={{token}}&size=256&format=png',
  },
};

/** URL template of the chosen service; null — none chosen or not configured */
export function logoTemplate(service: LogoService, customTemplate: string, token: string): string | null {
  if (service === 'none') return null;
  if (service === 'custom') return customTemplate.includes('{{website}}') ? customTemplate : null;
  if (service === 'logodev' && !token.trim()) return null;
  return LOGO_SERVICES[service].template;
}

/** Site logo URL from the template; null if no URL can be built */
export function buildLogoUrl(template: string, pageUrl: string, token = ''): string | null {
  const host = isWebUrl(pageUrl) ? getHostname(pageUrl) : '';
  if (!host || !template.includes('{{website}}')) return null;
  const url = template
    .replaceAll('{{website}}', encodeURIComponent(host))
    .replaceAll('{{token}}', encodeURIComponent(token.trim()));
  return isWebUrl(url) ? url : null;
}

/** A domain that doesn't exist: it reveals the placeholder a service returns for unknown sites */
export const UNKNOWN_SITE_URL = 'https://speeddial-default.invalid/';
