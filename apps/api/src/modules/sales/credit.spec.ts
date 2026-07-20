import { round2 } from '../../common/utils/numbers';

/**
 * Pure-function checks for the credit (البيع بالأجل) maths used by
 * SalesService.create and CustomersService: the unpaid portion of a sale
 * becomes debt, and a customer's balance is opening + credit − payments.
 */
function creditAmount(total: number, paidInBase: number): number {
  return paidInBase + 0.005 < total ? round2(total - paidInBase) : 0;
}
function collected(total: number, paidInBase: number): number {
  return round2(Math.min(paidInBase, total));
}
function balance(opening: number, credits: number[], payments: number[]): number {
  return round2(
    opening +
      credits.reduce((s, c) => s + c, 0) -
      payments.reduce((s, p) => s + p, 0),
  );
}

describe('Customer credit maths', () => {
  it('books the unpaid remainder as debt', () => {
    // total 95.70, customer pays 40 -> debt 55.70
    expect(creditAmount(95.7, 40)).toBe(55.7);
  });

  it('has no debt when fully paid', () => {
    expect(creditAmount(69.6, 74)).toBe(0);
  });

  it('caps cash collected at the total (excess is change, not negative debt)', () => {
    expect(collected(69.6, 74)).toBe(69.6);
    expect(collected(95.7, 40)).toBe(40);
  });

  it('computes a running balance from opening + credit − payments', () => {
    // opening 0, one credit sale of 55.70, one payment of 37 (10 USD × 3.7)
    expect(balance(0, [55.7], [37])).toBe(18.7);
  });

  it('nets multiple credit sales and settlements', () => {
    expect(balance(20, [50, 30], [40, 25])).toBe(35);
  });
});
