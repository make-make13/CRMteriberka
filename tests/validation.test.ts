import { describe, it, expect } from 'vitest';
import { validate, contractSchema, ValidationError } from '../server/validation';

const baseContract = {
  id: 'c1',
  number: 'БМ1',
  clientId: 'client-1',
  baseType: 'chunga-changa',
  status: 'signed_not_paid',
  totalAmount: 10000,
  prepayment: 3000,
  remainder: 7000,
  dateSigned: new Date(2026, 1, 1).toISOString(),
  bookings: [
    {
      objectId: 'cc-1',
      baseType: 'chunga-changa',
      startTime: new Date(2026, 1, 18, 14, 0).toISOString(),
      endTime: new Date(2026, 1, 20, 12, 0).toISOString(),
      type: 'main',
      price: 10000,
    },
  ],
};

describe('contractSchema', () => {
  it('принимает корректный договор', () => {
    expect(() => validate(contractSchema, baseContract)).not.toThrow();
  });

  it('предоплата больше суммы → ошибка', () => {
    const bad = { ...baseContract, prepayment: 20000, remainder: -10000 };
    expect(() => validate(contractSchema, bad)).toThrow(ValidationError);
  });

  it('остаток не равен сумме минус предоплате → ошибка', () => {
    const bad = { ...baseContract, remainder: 5000 };
    expect(() => validate(contractSchema, bad)).toThrow(ValidationError);
  });

  it('endTime раньше startTime → ошибка', () => {
    const bad = {
      ...baseContract,
      bookings: [
        {
          ...baseContract.bookings[0],
          startTime: new Date(2026, 1, 20).toISOString(),
          endTime: new Date(2026, 1, 18).toISOString(),
        },
      ],
    };
    expect(() => validate(contractSchema, bad)).toThrow(ValidationError);
  });

  it('неизвестный статус → ошибка', () => {
    const bad = { ...baseContract, status: 'unknown_status' };
    expect(() => validate(contractSchema, bad)).toThrow(ValidationError);
  });
});
