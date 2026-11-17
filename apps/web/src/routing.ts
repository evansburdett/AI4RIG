/**
 * Hash router. Hand-rolled because the packaged Electron build loads from
 * `file://`, where history routing needs a custom protocol handler. Small enough
 * to replace with react-router if the screen count grows.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type Screen = 'home' | 'profile' | 'breakdown' | 'report' | 'models' | 'tickers' | 'fees' | 'settings';

export interface Route {
  readonly screen: Screen;
  /** Absent on screens that are not about one client, like the model and ticker editors. */
  readonly clientNumber: string | null;
}

/** Home, the client list (RIG, 11/17): where the app opens, with no client's figures on screen. */
const DEFAULT_ROUTE: Route = { screen: 'home', clientNumber: null };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'tickers') return { screen: 'tickers', clientNumber: null };
  if (segments[0] === 'models') return { screen: 'models', clientNumber: null };
  if (segments[0] === 'fees') return { screen: 'fees', clientNumber: null };
  if (segments[0] === 'settings') return { screen: 'settings', clientNumber: null };

  if (segments[0] === 'clients' && segments[1] !== undefined) {
    const clientNumber = decodeURIComponent(segments[1]);
    const screen = segments[2] === 'breakdown' ? 'breakdown' : segments[2] === 'report' ? 'report' : 'profile';
    return { screen, clientNumber };
  }

  return DEFAULT_ROUTE;
}

export function hrefFor(route: Route): string {
  if (route.screen === 'home') return '#/';
  if (route.screen === 'tickers') return '#/tickers';
  if (route.screen === 'models') return '#/models';
  if (route.screen === 'fees') return '#/fees';
  if (route.screen === 'settings') return '#/settings';
  if (route.clientNumber === null) return '#/';
  const base = `#/clients/${encodeURIComponent(route.clientNumber)}`;
  if (route.screen === 'breakdown') return `${base}/breakdown`;
  if (route.screen === 'report') return `${base}/report`;
  return `${base}/profile`;
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

/** Screens that belong to no client: Home and the administrator's reference data. */
export function isReferenceScreen(screen: Screen): boolean {
  return screen === 'home' || screen === 'models' || screen === 'tickers' || screen === 'fees' || screen === 'settings';
}
