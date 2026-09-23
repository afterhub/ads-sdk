import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAds } from '../src/ads.ts';

function placement(id: string | null = 'p-1') {
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
  assert.equal(ads.mount(el), true);
  assert.equal(ads.mount(el), false);
});

test('ignores elements without a placement id', () => {
  assert.equal(createAds().mount(placement(null).el), false);
});

test('refresh only works on mounted placements', () => {
  const ads = createAds();
  const { el } = placement();
  assert.equal(ads.refresh(el), false);
  ads.mount(el);
  assert.equal(ads.refresh(el), true);
});

test('destroy empties the slot and allows a remount', () => {
  const ads = createAds();
  const p = placement();
  ads.mount(p.el);
  assert.equal(ads.destroy(p.el), true);
  assert.equal(p.cleared(), 1);
  assert.equal(ads.destroy(p.el), false);
  assert.equal(ads.mount(p.el), true);
});

test('never throws into the host page', () => {
  const broken = {
    getAttribute: () => {
      throw new Error('boom');
    },
  } as unknown as Element;
  assert.equal(createAds().mount(broken), false);
});
