import {mount} from 'svelte';
import {background} from '../lib/background.svelte';
import {bookmarks} from '../lib/bookmarks.svelte';
import {setLanguage, t} from '../lib/i18n/index.svelte';
import {icons} from '../lib/icons.svelte';
import {onDatabaseOutdated} from '../lib/idb';
import {isManifestOutdated} from '../lib/manifestCheck';
import {showNotice} from '../lib/notice.svelte';
import {permissions} from '../lib/permissions.svelte';
import {settings} from '../lib/settings/store.svelte';
import {thumbnails} from '../lib/thumbnails/store.svelte';
import App from './App.svelte';
import './styles/index.css';

const logError = (message: string) => (error: unknown) => console.error(message, error);

// Обновлённое расширение меняет структуру базы — эта вкладка работает на старом коде, перезагружаем её
onDatabaseOutdated(() => location.reload());

const settingsLoaded = settings.start();
settingsLoaded.catch(logError('Failed to load settings'));
permissions.start().catch(logError('Failed to check permissions'));
bookmarks.start(settingsLoaded).catch(logError('Failed to load bookmarks'));
icons.start(settingsLoaded).catch(logError('Failed to start icons'));
thumbnails.start();
background.load().catch(logError('Failed to load background'));

isManifestOutdated()
  .then((outdated) => {
    if (outdated) showNotice(t.notice.extensionUpdated(t.notice.reloadHint));
  })
  .catch(logError('Failed to check manifest'));

// Язык — до первой отрисовки: настройки уже прочитаны из кэша
setLanguage(settings.current.language);
mount(App, {target: document.getElementById('app')!});
