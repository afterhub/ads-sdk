import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Mirrors the build scripts in package.json.
async function bundle(dev: boolean): Promise<string> {
  const result = await build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    minify: !dev,
    format: 'iife',
    target: 'es2019',
    define: { __VERSION__: '"test"', __DEV__: String(dev) },
    write: false,
  });

  return result.outputFiles[0].text;
}

test('diagnostics are stripped from the production bundle', async () => {
  const production = await bundle(false);

  assert.doesNotMatch(production, /\[AfterAds\]|console\./);
});

test('the development bundle keeps them', async () => {
  const development = await bundle(true);

  assert.match(development, /\[AfterAds\]/);
  assert.match(development, /no fill for placement/);
});
