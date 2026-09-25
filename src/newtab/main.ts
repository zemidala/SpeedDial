import {mount} from 'svelte';
import {bookmarks} from '../lib/bookmarks.svelte';
import {icons} from '../lib/icons.svelte';
import {settings} from '../lib/settings.svelte';
import App from './App.svelte';
import './global.css';

const settingsLoaded = settings.start();
settingsLoaded.catch((error) => console.error('Failed to load settings', error));
bookmarks.start().catch((error) => console.error('Failed to load bookmarks', error));
icons.start(settingsLoaded).catch((error) => console.error('Failed to check permissions', error));

mount(App, {target: document.getElementById('app')!});
