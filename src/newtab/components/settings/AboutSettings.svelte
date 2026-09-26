<script lang="ts">
  import {onMount} from 'svelte';
  import {type AboutInfo, aboutInfo, aboutText} from '../../../lib/about';
  import {formatDateTime, t} from '../../../lib/i18n/index.svelte';
  import {SUPPORT_URL, WELCOME_PAGE} from '../../../lib/links';
  import SettingRow from './SettingRow.svelte';
  import SettingsGroup from './SettingsGroup.svelte';

  // Settings → About: version and build, as programs usually show them; details can be copied for bug reports
  let info = $state.raw<AboutInfo | null>(null);
  let status = $state('');

  onMount(() => {
    aboutInfo().then((result) => (info = result)).catch((error) => console.error('Failed to read about info', error));
  });

  async function copy() {
    if (!info) return;
    const text = aboutText(info, {build: t.about.build, browser: t.about.browser, id: t.about.extensionId});
    try {
      await navigator.clipboard.writeText(text);
      status = t.about.copied;
    } catch (error) {
      status = error instanceof Error ? error.message : String(error);
    }
  }
</script>

{#if info}
  <div class="about">
    <img class="about__logo" src="/icons/icon128.png" alt="" width="64" height="64">
    <div>
      <h3 class="about__name">{info.name}</h3>
      <p class="about__tagline">{t.about.tagline}</p>
      <p class="about__version">{t.about.versionBuild(info.version, info.build)}</p>
    </div>
  </div>

  <SettingsGroup title={t.about.details}>
    <SettingRow label={t.about.version}>
      <span class="about__value">{info.version}</span>
    </SettingRow>
    <SettingRow label={t.about.build}>
      <span class="about__value">{info.build} <span class="about__commit">({info.commit})</span> · {formatDateTime(info.builtAt)}</span>
    </SettingRow>
    <SettingRow label={t.about.browser}>
      <span class="about__value">{info.browser}</span>
    </SettingRow>
    <SettingRow label={t.about.extensionId}>
      <span class="about__value about__value--mono">{info.extensionId}</span>
    </SettingRow>
    <SettingRow label={t.about.install}>
      <span class="about__value">{info.development ? t.about.installDevelopment : t.about.installStore}</span>
    </SettingRow>
  </SettingsGroup>

  <div class="about__actions">
    <button type="button" class="button" onclick={copy}>{t.about.copy}</button>
    <a class="button" href={chrome.runtime.getURL(WELCOME_PAGE)} target="_blank">{t.about.welcomePage}</a>
    {#if status}
      <span class="about__status" role="status">{status}</span>
    {/if}
  </div>

  <SettingsGroup title={t.support.title}>
    <SettingRow label="Boosty" hint={t.support.hint}>
      <a class="button button--primary" href={SUPPORT_URL} target="_blank" rel="noopener">♥ {t.support.button}</a>
    </SettingRow>
  </SettingsGroup>
{/if}

<style>
  .about {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 12px;
  }

  .about__logo {
    flex-shrink: 0;
  }

  .about__name {
    margin: 0;
    font-size: 1.25rem;
  }

  .about__tagline,
  .about__version {
    margin: 2px 0 0;
    color: var(--text-muted);
  }

  .about__value {
    overflow-wrap: anywhere;
    user-select: text;
  }

  .about__commit {
    color: var(--text-muted);
  }

  .about__value--mono {
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    font-size: 0.8125rem;
  }

  .about__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }

  .about__status {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }
</style>
