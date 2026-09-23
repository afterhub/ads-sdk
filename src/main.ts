import { createAds, SELECTOR, type AfterAds } from './ads.ts';

declare global {
  interface Window {
    AfterAds?: AfterAds;
  }
}

// The tag may be pasted twice (theme + plugin); the second copy is a no-op.
if (!window.AfterAds) {
  const ads = createAds();
  window.AfterAds = ads;

  const scan = () => document.querySelectorAll(SELECTOR).forEach((el) => ads.mount(el));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }
}
