# After Ads SDK

Browser embed for the [After Ads](https://ads.after.si) network. One async tag, placements declared in HTML.

> **Status: scaffold.** Placements are discovered and managed, but no ads are requested yet. The delivery API is not published.

## Install

Once, in `<head>`:

```html
<script async src="https://ads.after.si/sdk/v1/ads.js"></script>
```

Where the unit should appear, with the IDs from your dashboard:

```html
<div data-ads-website="WEBSITE_ID" data-ads-placement="PLACEMENT_ID"></div>
```

Both IDs are public. They are not secrets.

## Guarantees

- Loads asynchronously; the host page never waits for it.
- Loading the tag twice is a no-op.
- No exception ever reaches the host page. On failure the slot stays empty.

## API

For single-page apps that add or remove placements after load:

```js
const ads = await window.AfterAds.ready();
const slot = ads.mount('#sidebar', { placement: 'PLACEMENT_ID' });

slot?.refresh(); // request a new ad
slot?.destroy(); // empty it; it can be mounted again
```

`mount` accepts a selector or an element. The placement ID defaults to the element's `data-ads-placement`. It returns `null` if the target is missing, has no placement ID, or is already mounted.

In an SPA, destroy slots when the view unmounts so observers do not leak across navigations.

## Development

Requires Node 24 (tests run TypeScript directly).

```sh
npm install
npm test          # node --test
npm run check     # tsc
npm run build     # dist/ads.js
```
