// Выделение нескольких плиток: галочка на плитке, Shift — диапазон, Ctrl+A — все
import {SvelteSet} from 'svelte/reactivity';

class SelectionStore {
  ids = new SvelteSet<string>();

  /** Плитка, от которой считается диапазон при Shift */
  #anchor: string | null = null;

  get active(): boolean {
    return this.ids.size > 0;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  toggle(id: string): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.#anchor = id;
  }

  /** Выделяет плитки от предыдущей отмеченной до id включительно — в порядке order */
  range(id: string, order: string[]): void {
    const from = this.#anchor ? order.indexOf(this.#anchor) : -1;
    const to = order.indexOf(id);
    if (to === -1) return;
    if (from === -1) {
      this.toggle(id);
      return;
    }
    for (const item of order.slice(Math.min(from, to), Math.max(from, to) + 1)) this.ids.add(item);
    this.#anchor = id;
  }

  selectAll(order: string[]): void {
    for (const id of order) this.ids.add(id);
  }

  /** Оставляет только плитки, которые ещё показаны: после удаления или смены папки */
  retain(order: string[]): void {
    const visible = new Set(order);
    for (const id of this.ids) if (!visible.has(id)) this.ids.delete(id);
    if (this.#anchor && !visible.has(this.#anchor)) this.#anchor = null;
  }

  clear(): void {
    this.ids.clear();
    this.#anchor = null;
  }

  /** Выделенные в порядке order */
  ordered(order: string[]): string[] {
    return order.filter((id) => this.ids.has(id));
  }
}

export const selection = new SelectionStore();
