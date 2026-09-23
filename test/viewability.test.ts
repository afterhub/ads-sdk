import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewabilityTimer } from '../src/viewability.ts';
import { fakeClock } from './clock.ts';

test('half visible for one continuous second fires once', () => {
  const clock = fakeClock();
  const fired: Array<[number, number]> = [];
  const timer = viewabilityTimer((ms, ratio) => void fired.push([ms, ratio]), clock);

  timer.update(0.6);
  clock.advance(999);
  assert.equal(fired.length, 0);

  timer.update(0.8);
  clock.advance(1);
  assert.deepEqual(fired, [[1000, 0.8]]);

  timer.update(1);
  clock.advance(5000);
  assert.equal(fired.length, 1);
});

test('dropping below half restarts the second', () => {
  const clock = fakeClock();
  let fired = 0;
  const timer = viewabilityTimer(() => void fired++, clock);

  timer.update(0.6);
  clock.advance(900);
  timer.update(0.4);
  timer.update(0.6);
  clock.advance(900);
  assert.equal(fired, 0);

  clock.advance(100);
  assert.equal(fired, 1);
});

test('less than half never fires', () => {
  const clock = fakeClock();
  let fired = 0;
  const timer = viewabilityTimer(() => void fired++, clock);

  timer.update(0.49);
  clock.advance(10_000);

  assert.equal(fired, 0);
});

test('stop cancels a running second', () => {
  const clock = fakeClock();
  let fired = 0;
  const timer = viewabilityTimer(() => void fired++, clock);

  timer.update(1);
  timer.stop();
  clock.advance(2000);

  assert.equal(fired, 0);
});
