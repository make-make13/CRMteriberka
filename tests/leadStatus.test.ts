import { describe, it, expect } from 'vitest';
import { normalizeLeadStatus } from '../src/components/leads/leadDisplay';

describe('normalizeLeadStatus', () => {
  it('принимает новый статус confirmed', () => {
    expect(normalizeLeadStatus('confirmed')).toBe('confirmed');
  });
  it('сохраняет существующие статусы (обратная совместимость)', () => {
    expect(normalizeLeadStatus('contract_created')).toBe('contract_created');
    expect(normalizeLeadStatus('client_created')).toBe('client_created');
    expect(normalizeLeadStatus('rejected')).toBe('rejected');
  });
  it('неизвестный статус → new', () => {
    expect(normalizeLeadStatus('whatever')).toBe('new');
    expect(normalizeLeadStatus(null)).toBe('new');
  });
});
