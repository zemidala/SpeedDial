// "Other folder…" from the browser's context menu: a small window to add a page or link to any folder
import {mount} from 'svelte';
import {setLanguage} from '../lib/i18n/index.svelte';
import {loadSettings} from '../lib/settings/storage';
import '../newtab/styles/index.css';
import AddToFolder from './AddToFolder.svelte';

const params = new URLSearchParams(location.search);
const tab = Number(params.get('tab'));

loadSettings()
  .then(({language}) => {
    setLanguage(language);
    mount(AddToFolder, {
      target: document.getElementById('app')!,
      props: {
        url: params.get('url') ?? '',
        title: params.get('title') ?? '',
        isLink: params.get('link') === '1',
        tabId: Number.isInteger(tab) && tab > 0 ? tab : undefined,
      },
    });
  })
  .catch((error) => console.error('Failed to open the folder choice', error));
