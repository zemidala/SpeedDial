import type {SortOrder, TypeOrder} from './settings/schema';

interface SortableNode {
  title: string;
  url?: string;
  dateAdded?: number;
}

const collator = new Intl.Collator('ru', {numeric: true, sensitivity: 'base'});

function compareBy(order: SortOrder, a: SortableNode, b: SortableNode): number {
  switch (order) {
    case 'title':
      return collator.compare(a.title, b.title);
    case 'url':
      return collator.compare(a.url ?? a.title, b.url ?? b.title);
    case 'dateAdded':
      return (b.dateAdded ?? 0) - (a.dateAdded ?? 0);
    default:
      return 0;
  }
}

function typeRank(order: TypeOrder, node: SortableNode): number {
  if (order === 'none') return 0;
  const isFolder = !node.url;
  return isFolder === (order === 'foldersFirst') ? 0 : 1;
}

/** Display order; the original array isn't changed. With 'none' the order is as in the browser */
export function sortNodes<T extends SortableNode>(nodes: T[], order: SortOrder, typeOrder: TypeOrder): T[] {
  if (order === 'none' && typeOrder === 'none') return nodes;
  // Stable sort: on ties the browser order stays
  return [...nodes].sort((a, b) => typeRank(typeOrder, a) - typeRank(typeOrder, b) || compareBy(order, a, b));
}
