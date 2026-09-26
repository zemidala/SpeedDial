<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {t} from '../../../lib/i18n/index.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {isDarkTheme} from '../../../lib/settings/theme';
  import Icon from '../ui/Icon.svelte';

  const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
  const dark = $derived(isDarkTheme(settings.current.theme, systemDark.current));
</script>

<!-- Быстрое переключение: выбирает тему явно; вернуть «как в системе» можно в настройках -->
<button
  type="button"
  class="icon-button"
  aria-label={dark ? t.header.enableLight : t.header.enableDark}
  title={dark ? t.header.lightTheme : t.header.darkTheme}
  onclick={() => settings.update({theme: dark ? 'light' : 'dark'})}
>
  <Icon name={dark ? 'sun' : 'moon'}/>
</button>
