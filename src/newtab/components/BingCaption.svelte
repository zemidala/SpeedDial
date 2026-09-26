<script lang="ts">
  import type {BingImage} from '../../lib/bing';

  // Подпись картинки дня Bing: что на ней и автор — условие использования картинок Bing
  let {image}: {image: BingImage} = $props();
</script>

<div class="bing-caption">
  {#if image.link}
    <a class="bing-caption__title" href={image.link} target="_blank" rel="noopener">{image.title || image.copyright}</a>
  {:else}
    <span class="bing-caption__title">{image.title || image.copyright}</span>
  {/if}
  {#if image.title && image.copyright}
    <span class="bing-caption__copyright">{image.copyright}</span>
  {/if}
</div>

<style>
  .bing-caption {
    position: fixed;
    bottom: 12px;
    left: 16px;
    display: flex;
    flex-direction: column;
    max-width: min(480px, calc(100vw - 32px));
    padding: 6px 10px;
    border-radius: var(--radius-small);
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.4;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .bing-caption:hover,
  .bing-caption:focus-within {
    opacity: 1;
  }

  .bing-caption__title {
    color: inherit;
    font-weight: 600;
    text-decoration: none;
  }

  a.bing-caption__title:hover {
    text-decoration: underline;
  }

  .bing-caption__copyright {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
