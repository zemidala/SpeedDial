<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {settings} from '../../lib/settings.svelte';
  import Icon from './Icon.svelte';

  const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
  const dark = $derived(settings.current.theme === 'auto' ? systemDark.current : settings.current.theme === 'dark');
</script>

<!-- Быстрое переключение: выбирает тему явно; вернуть «как в системе» можно в настройках -->
<button
  type="button"
  class="icon-button"
  aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
  title={dark ? 'Светлая тема' : 'Тёмная тема'}
  onclick={() => settings.update({theme: dark ? 'light' : 'dark'})}
>
  <Icon name={dark ? 'sun' : 'moon'}/>
</button>
