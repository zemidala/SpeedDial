// Сторонние сервисы иконок и логотипов. Все они узнают домены закладок, поэтому по умолчанию выключены
import type {LogoService} from './settings/schema';
import {getHostname, isWebUrl} from './url';

export interface LogoServiceInfo {
  name: string;
  /** {{website}} — домен сайта, {{token}} — ключ доступа */
  template: string;
  hint: string;
}

export const LOGO_SERVICES: Record<Exclude<LogoService, 'none' | 'custom'>, LogoServiceInfo> = {
  google: {
    name: 'Google',
    template: 'https://www.google.com/s2/favicons?domain={{website}}&sz=256',
    hint: 'До 256 px, если у сайта есть крупная иконка; маленькие растягивает',
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    template: 'https://icons.duckduckgo.com/ip3/{{website}}.ico',
    hint: 'Исходная иконка сайта, без растягивания',
  },
  iconhorse: {
    name: 'icon.horse',
    template: 'https://icon.horse/icon/{{website}}',
    hint: 'Сам ищет лучшую иконку сайта. Бесплатно — с ограничением числа запросов',
  },
  logodev: {
    name: 'logo.dev',
    template: 'https://img.logo.dev/{{website}}?token={{token}}&size=256&format=png',
    hint: 'Логотипы брендов. Нужен бесплатный ключ с logo.dev',
  },
};

/** Шаблон адреса выбранного сервиса; null — сервис не выбран или не настроен */
export function logoTemplate(service: LogoService, customTemplate: string, token: string): string | null {
  if (service === 'none') return null;
  if (service === 'custom') return customTemplate.includes('{{website}}') ? customTemplate : null;
  if (service === 'logodev' && !token.trim()) return null;
  return LOGO_SERVICES[service].template;
}

/** Адрес логотипа сайта по шаблону; null, если адрес не получается */
export function buildLogoUrl(template: string, pageUrl: string, token = ''): string | null {
  const host = isWebUrl(pageUrl) ? getHostname(pageUrl) : '';
  if (!host || !template.includes('{{website}}')) return null;
  const url = template
    .replaceAll('{{website}}', encodeURIComponent(host))
    .replaceAll('{{token}}', encodeURIComponent(token.trim()));
  return isWebUrl(url) ? url : null;
}

/** Домен, которого не существует: по нему узнаём заглушку, которую сервис отдаёт для неизвестных сайтов */
export const UNKNOWN_SITE_URL = 'https://speeddial-default.invalid/';
