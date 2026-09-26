// "Thanks for installing" page: opened once after installation from a store (see background/index.ts)
import {mount} from 'svelte';
import {setLanguage} from '../lib/i18n/index.svelte';
import {loadSettings} from '../lib/settings/storage';
import '../newtab/styles/index.css';
import Welcome from './Welcome.svelte';

loadSettings()
  .then(({language}) => setLanguage(language))
  .catch((error) => console.error('Failed to load settings', error));

mount(Welcome, {target: document.getElementById('app')!});
