import { createAds, SELECTOR, type AfterAds, type Env } from './ads.ts';

declare global {
  interface Window {
    AfterAds?: AfterAds;
  }
}

/** The network the tag was loaded from, so a staging tag talks to staging. */
function base(): string {
  const script = document.currentScript as HTMLScriptElement | null;

  try {
    return script?.src ? new URL(script.src).origin : 'https://ads.after.si';
  } catch {
    return 'https://ads.after.si';
  }
}

function browserEnv(): Env {
  return {
    doc: document,
    base: base(),
    fetch: (url, init) => window.fetch(url, init),
    sendBeacon: (url, data) =>
      typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon(url, data)
        : (void window.fetch(url, { method: 'POST', body: data, keepalive: true, mode: 'no-cors', credentials: 'omit' }).catch(() => undefined), true),
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    clock: {
      now: () => performance.now(),
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    observe(element, callback, options) {
      // Without IntersectionObserver nothing can be measured: load eagerly,
      // never report viewable, so nothing is ever billed on a guess.
      if (typeof IntersectionObserver === 'undefined') {
        if (options.rootMargin) callback({ isIntersecting: true, ratio: 1 });
        return () => undefined;
      }

      const observer = new IntersectionObserver(
        (entries) => entries.forEach((entry) => callback({ isIntersecting: entry.isIntersecting, ratio: entry.intersectionRatio })),
        options,
      );
      observer.observe(element);

      return () => observer.disconnect();
    },
  };
}

// The tag may be pasted twice (theme + plugin); the second copy is a no-op.
if (!window.AfterAds) {
  const ads = createAds(browserEnv());
  window.AfterAds = ads;

  const scan = () => document.querySelectorAll(SELECTOR).forEach((el) => void ads.mount(el));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }
}
