import { describe, expect, it } from 'vitest';

import type { ClientSummary } from '../domain/types.js';

import { filterClients } from './Home.js';

const client = (clientNumber: string, initials: string): ClientSummary => ({
  clientNumber,
  initials,
  lifeStage: 'DISTRIBUTION_GO_GO',
  updatedAt: '2026-11-17T12:00:00Z',
});

describe('filterClients', () => {
  const clients = [client('1042', 'A.B.'), client('2318', 'C.D.'), client('3104', '')];

  it('finds a client by number, as RIG asked (11/17)', () => {
    expect(filterClients(clients, '1042').map((c) => c.clientNumber)).toEqual(['1042']);
    expect(filterClients(clients, '10').map((c) => c.clientNumber)).toEqual(['1042', '3104']);
  });

  it('finds a client by initials, with or without the dots', () => {
    expect(filterClients(clients, 'ab').map((c) => c.clientNumber)).toEqual(['1042']);
    expect(filterClients(clients, 'C.D').map((c) => c.clientNumber)).toEqual(['2318']);
  });

  it('lists everyone when nothing is typed', () => {
    expect(filterClients(clients, '  ')).toHaveLength(3);
  });
});
