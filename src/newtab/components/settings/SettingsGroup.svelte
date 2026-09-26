<script lang="ts">
  import type {Snippet} from 'svelte';

  // A titled card that groups related settings inside a tab, like the setting cards in Edge and Opera
  // No accessible name on the section itself: it would compete with field labels ("Font", "Background")
  let {title, children}: {title: string; children: Snippet} = $props();
</script>

<section class="settings-group">
  <h3 class="settings-group__title">{title}</h3>
  <div class="settings-group__body">
    {@render children()}
  </div>
</section>

<style>
  .settings-group {
    margin-top: 20px;
  }

  .settings-group:first-child {
    margin-top: 8px;
  }

  .settings-group__title {
    margin: 0 0 8px;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  /* The card is a shade apart from the dialog: lighter in dark themes, darker in light ones */
  .settings-group__body {
    padding: 4px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: light-dark(var(--surface-muted), color-mix(in oklab, var(--surface), #fff 4%));
  }

  /* Thin dividers between rows, as in browser settings */
  .settings-group__body > :global(* + *) {
    border-top: 1px solid var(--border);
  }
</style>
