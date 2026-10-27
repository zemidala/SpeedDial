<script lang="ts">
  import {t} from '../../../lib/i18n/index.svelte';
  import {THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../../../lib/images';
  import {type Corner, type CropRect, initialCrop, moveCrop, resizeCrop, roundCrop} from '../../../lib/thumbnails/crop';
  import Modal from '../ui/Modal.svelte';

  // Choosing the part of an image that goes onto the tile: the image with a frame on the left, the tile as it will
  // look on the right. onsave gets the frame in image pixels, or null for the whole image
  let {image, name, onsave, onclose}: {
    image: Blob;
    /** The bookmark's name — under the tile preview */
    name: string;
    onsave: (crop: CropRect | null) => void;
    onclose: () => void;
  } = $props();

  /**
   * The frame keeps the proportions of the picture area of the tiles on the page — they depend on the settings
   * (a name inside the card takes part of it). With no tile in sight, the proportions of a stored thumbnail
   */
  function tileAspect(): number {
    const box = document.querySelector('.bookmark-grid .tile__visual')?.getBoundingClientRect();
    return box && box.width > 0 && box.height > 0 ? box.width / box.height : THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
  }
  const aspect = tileAspect();

  const imageUrl = $derived(URL.createObjectURL(image));
  $effect(() => {
    const url = imageUrl;
    return () => URL.revokeObjectURL(url);
  });

  let imageWidth = $state(0);
  let imageHeight = $state(0);
  let rect = $state<CropRect | null>(null);

  function onImageLoad(event: Event) {
    const img = event.currentTarget as HTMLImageElement;
    imageWidth = img.naturalWidth;
    imageHeight = img.naturalHeight;
    rect = initialCrop(imageWidth, imageHeight, aspect);
  }

  const percent = (value: number, of: number) => `${(value / of) * 100}%`;

  // Dragging: the frame itself moves, a corner resizes. Positions are counted from where the drag started,
  // in image pixels — the image is shown smaller than it is
  let stage: HTMLDivElement;
  let drag: {pointerId: number; corner: Corner | null; startX: number; startY: number; start: CropRect} | null = null;

  function onPointerDown(event: PointerEvent) {
    if (!rect || event.button !== 0) return;
    const corner = (event.target as HTMLElement).dataset.corner as Corner | undefined;
    drag = {pointerId: event.pointerId, corner: corner ?? null, startX: event.clientX, startY: event.clientY, start: rect};
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const scale = imageWidth / stage.getBoundingClientRect().width;
    const dx = (event.clientX - drag.startX) * scale;
    const dy = (event.clientY - drag.startY) * scale;
    rect = drag.corner
      ? resizeCrop(drag.start, drag.corner, dx, dy, imageWidth, imageHeight, aspect)
      : moveCrop(drag.start, dx, dy, imageWidth, imageHeight);
  }

  function onPointerUp(event: PointerEvent) {
    if (drag?.pointerId === event.pointerId) drag = null;
  }

  // Arrows move the frame by a hundredth of the image; with Shift they resize it from the bottom-right corner
  const KEYS: Record<string, [number, number]> = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};

  function onKeyDown(event: KeyboardEvent) {
    const direction = KEYS[event.key];
    if (!rect || !direction) return;
    event.preventDefault();
    const step = Math.max(1, imageWidth / 100);
    const [dx, dy] = [direction[0] * step, direction[1] * step];
    rect = event.shiftKey
      ? resizeCrop(rect, 'se', dx, dy, imageWidth, imageHeight, aspect)
      : moveCrop(rect, dx, dy, imageWidth, imageHeight);
  }

  const save = () => rect && onsave(roundCrop(rect, imageWidth, imageHeight));
  const hintId = $props.id();
</script>

<Modal title={t.crop.title} size="large" {onclose}>
  <div class="crop">
    <!-- The image clips the darkening around the frame; the frame with its corners sits above, unclipped, so a corner
         at the image's edge can still be grabbed -->
    <div class="crop__area" bind:this={stage}>
      <div class="crop__stage">
        <img class="crop__image" src={imageUrl} alt="" draggable="false" onload={onImageLoad}>
        {#if rect}
          <div
            class="crop__shade"
            style:left={percent(rect.x, imageWidth)}
            style:top={percent(rect.y, imageHeight)}
            style:width={percent(rect.width, imageWidth)}
            style:height={percent(rect.height, imageHeight)}
          ></div>
        {/if}
      </div>
      {#if rect}
        <button
          type="button"
          class="crop__frame"
          style:left={percent(rect.x, imageWidth)}
          style:top={percent(rect.y, imageHeight)}
          style:width={percent(rect.width, imageWidth)}
          style:height={percent(rect.height, imageHeight)}
          aria-label={t.crop.frame}
          aria-describedby={hintId}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          onkeydown={onKeyDown}
        >
          <span class="crop__handle crop__handle--nw" data-corner="nw"></span>
          <span class="crop__handle crop__handle--ne" data-corner="ne"></span>
          <span class="crop__handle crop__handle--sw" data-corner="sw"></span>
          <span class="crop__handle crop__handle--se" data-corner="se"></span>
        </button>
      {/if}
    </div>

    <div class="crop__side">
      <h3 class="crop__side-title">{t.crop.onTile}</h3>
      <div class="crop__tile">
        <div class="crop__tile-visual" style:aspect-ratio={aspect}>
          {#if rect}
            <img
              class="crop__tile-image"
              src={imageUrl}
              alt=""
              style:width={percent(imageWidth, rect.width)}
              style:left={percent(-rect.x, rect.width)}
              style:top={percent(-rect.y, rect.height)}
            >
          {/if}
        </div>
        <div class="crop__tile-title">{name}</div>
      </div>
      <p id={hintId} class="crop__hint">{t.crop.hint}</p>
    </div>
  </div>

  {#snippet footer()}
    <button type="button" class="button" onclick={() => onsave(null)}>{t.crop.whole}</button>
    <button type="button" class="button" onclick={onclose}>{t.common.cancel}</button>
    <button type="button" class="button button--primary" disabled={!rect} onclick={save}>{t.common.save}</button>
  {/snippet}
</Modal>

<style>
  /* Room above for the corners of a frame at the image's top edge */
  .crop {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: 16px;
    align-items: start;
    padding-top: 8px;
  }

  /* The area and the stage are exactly the size of the shown image: the frame is placed in percent of it */
  .crop__area {
    position: relative;
    justify-self: center;
    max-width: 100%;
    user-select: none;
  }

  .crop__stage {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-small);
    outline: 1px solid var(--border);
  }

  .crop__image {
    display: block;
    max-width: 100%;
    max-height: min(60vh, 520px);
  }

  /* Outside the frame is darkened by the shadow of this box */
  .crop__shade {
    position: absolute;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.52);
    pointer-events: none;
  }

  /* Thirds lines help to place the frame */
  .crop__frame {
    position: absolute;
    padding: 0;
    border: 2px solid #fff;
    outline: 1px solid rgb(0 0 0 / 0.45);
    background:
      linear-gradient(rgb(255 255 255 / 0.45), rgb(255 255 255 / 0.45)) 33.33% 0 / 1px 100% no-repeat,
      linear-gradient(rgb(255 255 255 / 0.45), rgb(255 255 255 / 0.45)) 66.67% 0 / 1px 100% no-repeat,
      linear-gradient(rgb(255 255 255 / 0.45), rgb(255 255 255 / 0.45)) 0 33.33% / 100% 1px no-repeat,
      linear-gradient(rgb(255 255 255 / 0.45), rgb(255 255 255 / 0.45)) 0 66.67% / 100% 1px no-repeat;
    cursor: move;
    touch-action: none;
  }

  /* Focus colours the frame itself — a second outline beside it would look like a misplaced frame */
  .crop__frame:focus-visible {
    border-color: var(--accent);
    outline-color: #fff;
  }

  /* A small visible square, a bigger area to grab (also with a finger) */
  .crop__handle {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid var(--accent);
    border-radius: 3px;
    background: #fff;
  }

  .crop__handle::before {
    content: "";
    position: absolute;
    inset: -9px;
  }

  .crop__handle--nw { left: -8px; top: -8px; cursor: nwse-resize; }
  .crop__handle--ne { right: -8px; top: -8px; cursor: nesw-resize; }
  .crop__handle--sw { left: -8px; bottom: -8px; cursor: nesw-resize; }
  .crop__handle--se { right: -8px; bottom: -8px; cursor: nwse-resize; }

  .crop__side-title {
    margin: 0 0 8px;
    color: var(--text);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  /* Like a tile on the page: the picture on top, the name below */
  .crop__tile {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--tile-bg);
    box-shadow: var(--shadow);
  }

  .crop__tile-visual {
    position: relative;
    overflow: hidden;
  }

  .crop__tile-image {
    position: absolute;
    max-width: none;
  }

  .crop__tile-title {
    overflow: hidden;
    padding: 7px 10px;
    font-size: 0.8125rem;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crop__hint {
    margin: 10px 0 0;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  /* Narrow window: the tile goes under the image, beside the hint; the image is lower so both fit */
  @media (max-width: 640px) {
    .crop {
      grid-template-columns: minmax(0, 1fr);
    }

    .crop__image {
      max-height: 42vh;
    }

    .crop__side {
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr);
      column-gap: 12px;
      align-items: start;
    }

    .crop__side-title {
      grid-column: 1 / -1;
    }

    .crop__hint {
      margin: 0;
    }
  }
</style>
