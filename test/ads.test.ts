import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createAds, type Env, type Intersection } from '../src/ads.ts';
import { fakeClock } from './clock.ts';

const W = 'website-1';

function setup(decision: (placement: string) => unknown = (p) => ({ placement: p, fill: true, token: `tok-${p}`, expires_in: 600, creative: { image: `https://ads.test/ad/v1/a/${p}`, width: 300, height: 250, alt: 'Boots', click: `https://ads.test/ad/v1/c/tok-${p}`, label: 'Ad' } })) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document;
  const clock = fakeClock();
  const requests: URL[] = [];
  const beacons: unknown[] = [];
  const observers = new Map<Element, Array<{ callback: (e: Intersection) => void; lazy: boolean; active: boolean }>>();

  const env: Env = {
    doc,
    base: 'https://ads.test',
    async fetch(url) {
      const parsed = new URL(url);
      requests.push(parsed);
      const ads = (parsed.searchParams.get('p') ?? '').split(',').map(decision);
      return { ok: true, json: async () => ({ ads }) };
    },
    sendBeacon(url, data) {
      beacons.push({ url, data });
      return true;
    },
    sleep: async () => {},
    clock,
    observe(element, callback, options) {
      const entry = { callback, lazy: Boolean(options.rootMargin), active: true };
      observers.set(element, [...(observers.get(element) ?? []), entry]);
      return () => void (entry.active = false);
    },
  };

  const slot = (placement: string) => {
    const el = doc.createElement('div');
    el.setAttribute('data-ads-placement', placement);
    el.setAttribute('data-ads-website', W);
    doc.body.append(el);
    return el;
  };

  const near = (el: Element) => observers.get(el)?.filter((o) => o.lazy && o.active).forEach((o) => o.callback({ isIntersecting: true, ratio: 0.1 }));
  const visible = (el: Element, ratio: number) => observers.get(el)?.filter((o) => !o.lazy && o.active).forEach((o) => o.callback({ isIntersecting: true, ratio }));
  const settle = async () => {
    clock.advance(0);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const events = async () => Promise.all(beacons.map(async (b) => JSON.parse(await ((b as { data: Blob }).data).text()).e)).then((all) => all.flat());

  return { doc, clock, env, requests, observers, slot, near, visible, settle, events, ads: createAds(env) };
}

test('nothing is requested until the slot is near the viewport', async () => {
  const t = setup();
  t.ads.mount(t.slot('p1'));
  await t.settle();

  assert.equal(t.requests.length, 0);
});

test('slots near the viewport in the same tick share one request', async () => {
  const t = setup();
  const a = t.slot('p1');
  const b = t.slot('p2');
  t.ads.mount(a);
  t.ads.mount(b);

  t.near(a);
  t.near(b);
  await t.settle();

  assert.equal(t.requests.length, 1);
  assert.equal(t.requests[0].searchParams.get('p'), 'p1,p2');
  assert.equal(t.requests[0].searchParams.get('w'), W);
});

test('a fill renders a labelled link and image, never advertiser markup', async () => {
  const t = setup();
  const el = t.slot('p1');
  t.ads.mount(el);
  t.near(el);
  await t.settle();

  const link = el.querySelector('a');
  assert.equal(link?.getAttribute('href'), 'https://ads.test/ad/v1/c/tok-p1');
  assert.equal(link?.getAttribute('rel'), 'sponsored noopener');
  assert.equal(el.querySelector('img')?.getAttribute('src'), 'https://ads.test/ad/v1/a/p1');
  assert.equal(link?.textContent, 'Ad');
});

test('rendered is reported on image load, viewable after one second at half', async () => {
  const t = setup();
  const el = t.slot('p1');
  t.ads.mount(el);
  t.near(el);
  await t.settle();

  const image = el.querySelector('img') as HTMLImageElement;
  image.dispatchEvent(new t.doc.defaultView!.Event('load'));
  t.visible(image, 0.64);
  t.clock.advance(1000);

  assert.deepEqual(await t.events(), [
    { t: 'rendered', k: 'tok-p1' },
    { t: 'viewable', k: 'tok-p1', ms: 1000, r: 0.64 },
  ]);
});

test('a no-fill leaves the slot empty and reports nothing', async () => {
  const t = setup((p) => ({ placement: p, fill: false }));
  const el = t.slot('p1');
  t.ads.mount(el);
  t.near(el);
  await t.settle();

  assert.equal(el.children.length, 0);
  assert.deepEqual(await t.events(), []);
});

test('destroy empties the slot and stops every observer', async () => {
  const t = setup();
  const el = t.slot('p1');
  const slot = t.ads.mount(el)!;
  t.near(el);
  await t.settle();
  (el.querySelector('img') as HTMLImageElement).dispatchEvent(new t.doc.defaultView!.Event('load'));

  slot.destroy();

  assert.equal(el.children.length, 0);
  const active = [...t.observers.values()].flat().filter((o) => o.active);
  assert.equal(active.length, 0);
  assert.notEqual(t.ads.mount(el), null);
});

test('a response arriving after destroy is ignored', async () => {
  const t = setup();
  const el = t.slot('p1');
  const slot = t.ads.mount(el)!;
  t.near(el);
  t.clock.advance(0);
  slot.destroy();
  await t.settle();

  assert.equal(el.children.length, 0);
});

test('a slot without a website ID is not mounted', () => {
  const t = setup();
  const el = t.doc.createElement('div');
  el.setAttribute('data-ads-placement', 'p1');

  assert.equal(t.ads.mount(el), null);
});

test('mounting twice is refused, and nothing ever throws into the page', () => {
  const t = setup();
  const el = t.slot('p1');

  assert.notEqual(t.ads.mount(el), null);
  assert.equal(t.ads.mount(el), null);
  assert.equal(t.ads.mount({} as Element), null);
});

test('ready resolves to the same instance', async () => {
  const t = setup();
  assert.equal(await t.ads.ready(), t.ads);
});
