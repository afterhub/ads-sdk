import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAds } from '../src/ads.ts';

function placement(id: string | null = 'plc_1') {
  let cleared = 0;
  const el = {
    getAttribute: (name: string) => (name === 'data-ads-placement' ? id : null),
    replaceChildren: () => void cleared++,
  } as unknown as Element;
  return { el, cleared: () => cleared };
}

test('mounts a placement once', () => {
  const ads = createAds();
  const { el } = placement();
  const slot = ads.mount(el);
  assert.equal(slot?.placement, 'plc_1');
  assert.equal(ads.mount(el), null);
});

test('mounts by selector with an explicit placement', () => {
  const { el } = placement(null);
  const ads = createAds((selector) => (selector === '#sidebar' ? el : null));
  assert.equal(ads.mount('#sidebar', { placement: 'plc_9' })?.placement, 'plc_9');
  assert.equal(ads.mount('#missing', { placement: 'plc_9' }), null);
});

test('ignores elements without a placement id', () => {
  assert.equal(createAds().mount(placement(null).el), null);
});

test('destroy empties the slot and allows a remount', () => {
  const ads = createAds();
  const p = placement();
  ads.mount(p.el)!.destroy();
  assert.equal(p.cleared(), 1);
  assert.notEqual(ads.mount(p.el), null);
});

test('ready resolves to the same instance', async () => {
  const ads = createAds();
  assert.equal(await ads.ready(), ads);
});

test('never throws into the host page', () => {
  const broken = {
    getAttribute: () => {
      throw new Error('boom');
    },
  } as unknown as Element;
  assert.equal(createAds().mount(broken), null);
});
