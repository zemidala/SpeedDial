// The popup of the toolbar icon: numbers, version, updates and the way to SpeedDial and its settings
import {mount} from 'svelte';
import {setLanguage} from '../lib/i18n/index.svelte';
import {loadSettings} from '../lib/settings/storage';
import '../newtab/styles/index.css';
import Popup from './Popup.svelte';

loadSettings()
  .then(({language}) => setLanguage(language))
  .catch((error) => console.error('Failed to load settings', error));

mount(Popup, {target: document.getElementById('app')!});
