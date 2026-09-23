import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, decisionUrl, RETRY_DELAYS } from '../src/transport.ts';

const fill = {
  placement: 'p1',
  fill: true,
  token: 'd1.sig',
  expires_in: 600,
  creative: { image: 'https://ads.test/ad/v1/a/v1', width: 300, height: 250, alt: 'Boots', click: 'https://ads.test/ad/v1/c/d1.sig', label: 'Ad' },
};

const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });

test('the decision URL carries website, placements, widths and version only', () => {
  const url = new URL(decisionUrl('https://ads.test', 'w1', [{ placement: 'p1', width: 300.4 }, { placement: 'p2', width: 728 }], '1.0.0'));

  assert.equal(url.pathname, '/ad/v1/decision');
  assert.deepEqual(Object.fromEntries(url.searchParams), { w: 'w1', p: 'p1,p2', cw: '300,728', v: '1.0.0' });
});

test('a fill and a no-fill are read per placement', async () => {
  const decisions = await decide('https://ads.test', 'w1', [], '1', ok({ ads: [fill, { placement: 'p2', fill: false }] }), async () => {});

  assert.equal(decisions.get('p1')?.fill, true);
  assert.equal(decisions.get('p2')?.fill, false);
});

test('a malformed fill is treated as a no-fill', async () => {
  const decisions = await decide('https://ads.test', 'w1', [], '1', ok({ ads: [{ placement: 'p1', fill: true }] }), async () => {});

  assert.equal(decisions.get('p1')?.fill, false);
});

test('a network failure is retried twice with backoff, then gives up quietly', async () => {
  let calls = 0;
  const slept: number[] = [];
  const failing = async () => {
    calls++;
    throw new TypeError('network');
  };

  const decisions = await decide('https://ads.test', 'w1', [], '1', failing, async (ms) => void slept.push(ms));

  assert.equal(calls, 3);
  assert.deepEqual(slept, RETRY_DELAYS);
  assert.equal(decisions.size, 0);
});

test('a response is never retried, whatever its status', async () => {
  let calls = 0;
  const serverError = async () => {
    calls++;
    return { ok: false, json: async () => ({}) };
  };

  const decisions = await decide('https://ads.test', 'w1', [], '1', serverError, async () => {});

  assert.equal(calls, 1);
  assert.equal(decisions.size, 0);
});

test('a body that is not JSON is a no-fill', async () => {
  const broken = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } });

  assert.equal((await decide('https://ads.test', 'w1', [], '1', broken, async () => {})).size, 0);
});
