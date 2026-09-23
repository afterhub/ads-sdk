import type { Creative } from './transport.ts';

/**
 * Structured rendering: the creative is data, never markup. We build the link
 * and image ourselves, so no advertiser HTML or script ever reaches the page.
 * Returns the image, whose load is the "rendered" moment.
 */
export function render(slot: Element, creative: Creative, doc: Document): HTMLImageElement {
  const link = doc.createElement('a');
  link.href = creative.click;
  link.target = '_blank';
  link.rel = 'sponsored noopener';
  link.style.cssText = 'position:relative;display:inline-block;line-height:0;max-width:100%';

  const image = doc.createElement('img');
  image.src = creative.image;
  image.alt = creative.alt;
  image.width = creative.width;
  image.height = creative.height;
  image.decoding = 'async';
  image.style.cssText = 'display:block;max-width:100%;height:auto;border:0';

  const label = doc.createElement('span');
  label.textContent = creative.label || 'Ad';
  label.style.cssText =
    'position:absolute;top:4px;right:4px;padding:1px 5px;border-radius:3px;' +
    'background:rgba(0,0,0,.55);color:#fff;font:600 10px/14px system-ui,sans-serif;letter-spacing:.04em';

  link.append(image, label);
  slot.replaceChildren(link);

  return image;
}
