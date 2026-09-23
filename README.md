# After Ads SDK

Browser embed for the [After Ads](https://ads.after.si) network. One async tag, placements declared in HTML. About 2.3 KB gzipped, no dependencies.

## Install

Once, in `<head>`:

```html
<script async src="https://ads.after.si/sdk/v1/ads.js"></script>
```

Where the unit should appear, with the IDs from your dashboard:

```html
<div data-ads-website="WEBSITE_ID" data-ads-placement="PLACEMENT_ID"></div>
```

Both IDs are public. They are not secrets. Reserve the unit's size in your own CSS so nothing shifts when the ad arrives.

## What it does

1. **Waits** until a placement is within 200px of the viewport.
2. **Asks once per page**: every placement that comes near in the same tick shares one `GET /ad/v1/decision` request. Only the website and placement IDs, the measured container width and the SDK version are sent: no page URL, no cookie, no identifier.
3. **Renders structured data**, never advertiser markup: a link (`rel="sponsored"`) around an image, with an "Ad" label.
4. **Reports** `rendered` when the image has loaded, and `viewable` once at least 50% of it has been on screen for one continuous second, both as a `text/plain` beacon to `POST /ad/v1/events`. The server re-checks the rule before anything is billed.

## Guarantees

- Loads asynchronously; the host page never waits for it.
- Loading the tag twice is a no-op.
- No exception ever reaches the host page. On any failure the slot stays empty.
- A decision is retried only on a network failure, at most twice. A lost event is never retried: an unreported impression is simply not billed.
- Without `IntersectionObserver` nothing is measured, so nothing is reported as viewable.

## API

For single-page apps that add or remove placements after load:

```js
const ads = await window.AfterAds.ready();
const slot = ads.mount('#sidebar', { website: 'WEBSITE_ID', placement: 'PLACEMENT_ID' });

slot?.refresh(); // request a new ad now
slot?.destroy(); // empty it and stop observing; it can be mounted again
```

`mount` accepts a selector or an element. The IDs default to the element's `data-ads-website` and `data-ads-placement`. It returns `null` if the target is missing, lacks an ID, or is already mounted.

In an SPA, destroy slots when the view unmounts so observers do not leak across navigations.

## Development

Requires Node 24 (tests run TypeScript directly).

```sh
npm install
npm test          # node --test
npm run check     # tsc
npm run build     # dist/ads.js
```
