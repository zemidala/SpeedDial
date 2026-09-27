import {mount} from 'svelte';
import {background} from '../lib/background.svelte';
import {bookmarks} from '../lib/bookmarks.svelte';
import {brokenLinks} from '../lib/brokenLinks.svelte';
import {setLanguage, t} from '../lib/i18n/index.svelte';
import {icons} from '../lib/icons.svelte';
import {onDatabaseOutdated} from '../lib/idb';
import {isManifestOutdated} from '../lib/manifestCheck';
import {showNotice} from '../lib/notice.svelte';
import {reportOpenTab} from '../lib/openTabs';
import {descriptions, iconOnly} from '../lib/perBookmark.svelte';
import {permissions} from '../lib/permissions.svelte';
import {searchHistory} from '../lib/searchHistory.svelte';
import {settings} from '../lib/settings/store.svelte';
import {takeSettingsRequest} from '../lib/settingsRequest';
import {shelves} from '../lib/shelves.svelte';
import {thumbnails} from '../lib/thumbnails/store.svelte';
import {openSettingsTab} from '../lib/ui.svelte';
import {takePendingRelease} from '../lib/whatsNew';
import App from './App.svelte';
import './styles/index.css';

const logError = (message: string) => (error: unknown) => console.error(message, error);

// An updated extension changes the database structure — this tab runs old code, so reload it
onDatabaseOutdated(() => location.reload());

const settingsLoaded = settings.start();
settingsLoaded.catch(logError('Failed to load settings'));
permissions.start().catch(logError('Failed to check permissions'));
bookmarks.start(settingsLoaded).catch(logError('Failed to load bookmarks'));
icons.start(settingsLoaded).catch(logError('Failed to start icons'));
thumbnails.start();
shelves.start();
searchHistory.start().catch(logError('Failed to load recent searches'));
brokenLinks.start();
iconOnly.start();
descriptions.start();
background.load().catch(logError('Failed to load background'));

// Updated to a new release: tell once, with a way to the list of changes
takePendingRelease()
  .then((release) => {
    if (release) showNotice(t.whatsNew.notice(release), 'info', {label: t.whatsNew.open, run: () => openSettingsTab('about')});
  })
  .catch(logError('Failed to check for an update'));

// The service worker remembers this tab: after a reload of the extension SpeedDial comes back into it
reportOpenTab();

// Opened from the toolbar popup's "Settings"
takeSettingsRequest()
  .then((tab) => {
    if (tab) openSettingsTab(tab);
  })
  .catch(logError('Failed to read the settings request'));

isManifestOutdated()
  .then((outdated) => {
    if (outdated) showNotice(t.notice.extensionUpdated(t.notice.reloadHint));
  })
  .catch(logError('Failed to check manifest'));

// Language — before the first render: settings have already been read from the cache
setLanguage(settings.current.language);
mount(App, {target: document.getElementById('app')!});
