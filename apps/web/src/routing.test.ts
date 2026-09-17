import { describe, expect, it } from 'vitest';

import { hrefFor, parseHash } from './routing.js';

describe('parseHash', () => {
  it('reads a client screen', () => {
    expect(parseHash('#/clients/1042/profile')).toEqual({
      screen: 'profile',
      clientNumber: '1042',
    });
    expect(parseHash('#/clients/1042/breakdown')).toEqual({
      screen: 'breakdown',
      clientNumber: '1042',
    });
  });

  it('defaults a client route with no screen to the profile', () => {
    expect(parseHash('#/clients/1042')).toEqual({ screen: 'profile', clientNumber: '1042' });
  });

  it('reads the ticker editor, which belongs to no client', () => {
    expect(parseHash('#/tickers')).toEqual({ screen: 'tickers', clientNumber: null });
  });

  it('falls back rather than throwing on anything it does not recognise', () => {
    for (const hash of ['', '#', '#/', '#/nonsense', '#/clients']) {
      expect(parseHash(hash)).toEqual({ screen: 'profile', clientNumber: null });
    }
  });

  it('round-trips through hrefFor', () => {
    for (const hash of ['#/clients/1042/profile', '#/clients/1042/breakdown', '#/tickers']) {
      expect(hrefFor(parseHash(hash))).toBe(hash);
    }
  });
});
