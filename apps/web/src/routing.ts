/**
 * A hash router, in about sixty lines, instead of a routing library.
 *
 * Two reasons it is hand-rolled. The first is that this app has four screens
 * and no nested layouts, so a router is the smallest part of the problem. The
 * second is Electron: the packaged app loads the bundle from `file://`, where
 * history-based routing needs either a custom protocol handler or a server that
 * is not there. Hash routing works unchanged in both places, so the packaging
 * step at the end of the project stays the packaging step it was scoped as.
 *
 * If the screen count grows past a dozen, or nested layouts show up, swap this
 * for react-router and delete the file. It is deliberately small enough to
 * throw away.
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

/**
 * The current route, and a way to change it.
 *
 * `useSyncExternalStore` rather than `useState` plus an effect: the hash is
 * external state that can change without React's involvement (the back button,
 * a typed URL), and this is the hook built for exactly that.
 */
export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, currentHash, () => '');

  const navigate = useCallback((route: Route) => {
    const href = hrefFor(route);
    // Assigning an identical hash fires no hashchange, so bail rather than
    // leaving a caller wondering why nothing happened.
    if (window.location.hash !== href) window.location.hash = href;
  }, []);

  return [parseHash(hash), navigate];
}
