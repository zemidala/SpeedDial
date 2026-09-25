import type {BookmarkNode} from './bookmarks.svelte';

export type Dialog =
  | {kind: 'create'}
  | {kind: 'edit'; node: BookmarkNode}
  | {kind: 'delete'; node: BookmarkNode};

// Открытый диалог; одновременно показывается не больше одного
export const ui = $state<{dialog: Dialog | null}>({dialog: null});
