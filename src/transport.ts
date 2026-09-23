/**
 * The wire contract: GET /ad/v1/decision and POST /ad/v1/events.
 *
 * Neither needs a CORS preflight: the decision is a plain GET and events are a
 * text/plain beacon. Nothing identifying is sent: no page URL, no cookie.
 */

export interface Creative {
  image: string;
  width: number;
  height: number;
  alt: string;
  click: string;
  label: string;
}

export interface Fill {
  placement: string;
  fill: true;
  token: string;
  expires_in: number;
  creative: Creative;
}

export interface NoFill {
  placement: string;
  fill: false;
}

export type Decision = Fill | NoFill;

export interface SlotRequest {
  placement: string;
  /** Measured container width in CSS pixels. */
  width: number;
}

export type Event =
  | { t: 'rendered'; k: string }
  | { t: 'viewable'; k: string; ms: number; r: number };

type Fetch = (url: string, init: { credentials: 'omit'; cache: 'no-store' }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
type Sleep = (ms: number) => Promise<void>;

/** Retry only a network failure, at most twice; never retry a response. */
export const RETRY_DELAYS = [500, 2000];

export function decisionUrl(base: string, website: string, slots: SlotRequest[], version: string): string {
  const query = new URLSearchParams({
    w: website,
    p: slots.map((slot) => slot.placement).join(','),
    cw: slots.map((slot) => String(Math.max(0, Math.round(slot.width)))).join(','),
    v: version,
  });

  return `${base}/ad/v1/decision?${query}`;
}

/**
 * One decision request for a page's slots. Anything but a well-formed 200
 * is a no-fill for every slot: the host page never sees our failure.
 */
export async function decide(
  base: string,
  website: string,
  slots: SlotRequest[],
  version: string,
  fetchImpl: Fetch,
  sleep: Sleep,
): Promise<Map<string, Decision>> {
  const url = decisionUrl(base, website, slots, version);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    let response;

    try {
      response = await fetchImpl(url, { credentials: 'omit', cache: 'no-store' });
    } catch {
      if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt]);
      continue;
    }

    return response.ok ? parse(await response.json().catch(() => null)) : new Map();
  }

  return new Map();
}

function parse(body: unknown): Map<string, Decision> {
  const decisions = new Map<string, Decision>();
  const ads = (body as { ads?: unknown } | null)?.ads;

  if (!Array.isArray(ads)) return decisions;

  for (const ad of ads) {
    if (ad && typeof ad.placement === 'string') {
      decisions.set(ad.placement, isFill(ad) ? ad : { placement: ad.placement, fill: false });
    }
  }

  return decisions;
}

function isFill(ad: Record<string, unknown>): ad is Fill & Record<string, unknown> {
  const creative = ad.creative as Record<string, unknown> | undefined;

  return (
    ad.fill === true &&
    typeof ad.token === 'string' &&
    !!creative &&
    typeof creative.image === 'string' &&
    typeof creative.click === 'string' &&
    typeof creative.width === 'number' &&
    typeof creative.height === 'number'
  );
}

type SendBeacon = (url: string, data: Blob) => boolean;

/** Fire and forget. A lost event is an unbilled impression: the safe direction. */
export function beacon(base: string, events: Event[], sendBeacon: SendBeacon): void {
  if (events.length === 0) return;

  sendBeacon(`${base}/ad/v1/events`, new Blob([JSON.stringify({ e: events })], { type: 'text/plain' }));
}
