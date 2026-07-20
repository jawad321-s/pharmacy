import { round2 } from '../../common/utils/numbers';

/**
 * Pure-function checks for the multi-currency payment maths used by
 * SalesService.create: foreign tender is converted to the base currency
 * at the tenant exchange rate; total, paid and change are all stored in
 * the base currency.
 */
function convert(paidForeign: number, rate: number) {
  const paidInBase = round2(paidForeign * rate);
  return paidInBase;
}

describe('POS multi-currency conversion', () => {
  const ILS_PER_USD = 3.7;
  const ILS_PER_JOD = 5.2;

  it('converts a USD tender to the Shekel base', () => {
    // 20 USD at 3.7 => 74.00 ILS
    expect(convert(20, ILS_PER_USD)).toBe(74);
  });

  it('converts a JOD tender to the Shekel base', () => {
    // 15 JOD at 5.2 => 78.00 ILS
    expect(convert(15, ILS_PER_JOD)).toBe(78);
  });

  it('leaves base-currency tender unchanged (rate 1)', () => {
    expect(convert(69.6, 1)).toBe(69.6);
  });

  it('computes change in the base currency', () => {
    const total = 69.6; // ILS (60 net + 16% VAT)
    const paidInBase = convert(20, ILS_PER_USD); // 74 ILS
    expect(round2(paidInBase - total)).toBe(4.4);
  });

  it('detects underpayment after conversion', () => {
    const total = 69.6;
    const paidInBase = convert(15, ILS_PER_USD); // 55.5 ILS
    expect(paidInBase + 0.005 < total).toBe(true);
  });
});
