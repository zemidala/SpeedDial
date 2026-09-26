<script lang="ts">
  import {currentLanguage, t} from '../lib/i18n/index.svelte';
  import {SUPPORT_URL} from '../lib/links';

  $effect(() => {
    document.documentElement.lang = currentLanguage();
    document.title = t.welcome.title;
  });
</script>

<main class="welcome">
  <img class="welcome__logo" src="/icons/icon128.png" alt="" width="96" height="96">
  <h1 class="welcome__title">{t.welcome.title}</h1>
  <p class="welcome__lead">{t.welcome.lead}</p>

  <ul class="welcome__features">
    {#each t.welcome.features as feature (feature)}
      <li>{feature}</li>
    {/each}
  </ul>

  <div class="welcome__actions">
    <a class="button button--primary welcome__open" href={chrome.runtime.getURL('newtab.html')}>{t.welcome.open}</a>
  </div>

  <section class="welcome__support">
    <p>{t.support.hint}</p>
    <a class="button" href={SUPPORT_URL} target="_blank" rel="noopener">♥ {t.support.button}</a>
  </section>
</main>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 640px;
    margin: 0 auto;
    padding: 64px 24px;
    text-align: center;
  }

  .welcome__title {
    margin: 20px 0 8px;
    font-size: 1.75rem;
  }

  .welcome__lead {
    margin: 0;
    color: var(--text-muted);
    font-size: 1.0625rem;
    line-height: 1.5;
  }

  .welcome__features {
    margin: 28px 0;
    padding: 16px 20px 16px 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    line-height: 1.8;
    text-align: left;
  }

  .welcome__open {
    padding: 10px 24px;
    font-size: 1rem;
  }

  .welcome__support {
    margin-top: 40px;
    color: var(--text-muted);
  }

  .welcome__support p {
    margin: 0 0 12px;
  }
</style>
