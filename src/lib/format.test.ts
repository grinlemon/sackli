import { describe, expect, it } from 'vitest';
import { amount, money, pct, shareOfTotal } from './format';

describe('money', () => {
  it('utilise l\'apostrophe suisse comme séparateur de milliers', () => {
    expect(money(1620)).toBe("CHF 1'620");
    expect(amount(9600)).toBe("9'600");
  });

  it('arrondit au franc', () => {
    expect(money(1620.49)).toBe("CHF 1'620");
    expect(money(1620.5)).toBe("CHF 1'621");
  });
});

describe('shareOfTotal', () => {
  it('rend une part du total', () => {
    expect(shareOfTotal(1759, 9600)).toBe('18%');
    expect(shareOfTotal(9600, 9600)).toBe('100%');
  });

  it('distingue « très peu » de « rien » — sinon ça se lit comme un bug', () => {
    // Une ligne annuelle de 5.– face à 9'600 de revenu : 0,004 %.
    expect(shareOfTotal(0.42, 9600)).toBe('<1%');
    expect(shareOfTotal(0, 9600)).toBe('0%');
  });

  it('ne divise pas par zéro', () => {
    expect(shareOfTotal(100, 0)).toBe('—');
    expect(pct(0)).toBe('0%');
  });
});
