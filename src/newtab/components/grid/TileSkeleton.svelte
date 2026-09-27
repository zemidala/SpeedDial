<script lang="ts">
  import {settings} from '../../../lib/settings/store.svelte';

  // A placeholder tile while the bookmarks load: the same card and name line as a real tile, in the same place
  const position = $derived(settings.current.titlePosition);
  const inside = $derived(position.endsWith('inside'));
  const showTitle = $derived(settings.current.showTitles);
</script>

{#snippet title()}
  <span class="tile__title"><span class="tile__skeleton-line"></span></span>
{/snippet}

<div class="tile tile--title-{position} tile--skeleton" aria-hidden="true">
  <span class="tile__card">
    <span class="tile__visual"></span>
    {#if showTitle && inside}
      {@render title()}
    {/if}
  </span>
  {#if showTitle && !inside}
    {@render title()}
  {/if}
</div>
