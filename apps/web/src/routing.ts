/**
 * Hash router. Hand-rolled because the packaged Electron build loads from
 * `file://`, where history routing needs a custom protocol handler. Small enough
 * to replace with react-router if the screen count grows.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type Screen = 'profile' | 'breakdown' | 'tickers';

export interface Route {
  readonly screen: Screen;
  /** Absent on screens that are not about one client, like the ticker editor. */
  readonly clientNumber: string | null;
}

const DEFAULT_ROUTE: Route = { screen: 'profile', clientNumber: null };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'tickers') return { screen: 'tickers', clientNumber: null };

  if (segments[0] === 'clients' && segments[1] !== undefined) {
    const clientNumber = decodeURIComponent(segments[1]);
    const screen = segments[2] === 'breakdown' ? 'breakdown' : 'profile';
    return { screen, clientNumber };
  }

  return DEFAULT_ROUTE;
}

export function hrefFor(route: Route): string {
  if (route.screen === 'tickers') return '#/tickers';
  if (route.clientNumber === null) return '#/';
  const base = `#/clients/${encodeURIComponent(route.clientNumber)}`;
  return route.screen === 'breakdown' ? `${base}/breakdown` : `${base}/profile`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function currentHash(): string {
  return window.location.hash;
}

/** The hash can change without React's involvement, hence useSyncExternalStore. */
export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, currentHash, () => '');

  const navigate = useCallback((route: Route) => {
    const href = hrefFor(route);
    // An identical hash fires no hashchange event.
    if (window.location.hash !== href) window.location.hash = href;
  }, []);

  return [parseHash(hash), navigate];
}
