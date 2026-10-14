import { describe, expect, it } from 'vitest';
import type { BudgetMember, Transaction } from '$lib/types';
import {
  appliedCommonWeights,
  balanceSpread,
  detectBalanceChoice,
  type BalanceMode,
  balancedCommonWeights,
  commonTotal,
  householdSummary,
  incomeFlow,
  incomeWeights,
  isDefaultSplit,
  rebalance,
  splitPercents,
  splitPreset,
  wholePercents,
  memberFlow,
  simulateCommonSplit,
  memberBreakdown,
  monthlyAmount,
  shareOf,
  sliderPercent,
  splitWeights
} from './calc';

const g: BudgetMember = {
  id: 'g', budget_id: 'b', user_id: 'u1', invite_email: null, display_name: 'Alex', position: 1
};
const i: BudgetMember = {
  id: 'i', budget_id: 'b', user_id: null, invite_email: null, display_name: 'Sam', position: 2
};
const members = [g, i];

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 't', budget_id: 'b', name: '', kind: 'expense', amount: 0, category_id: null,
    frequency: 'monthly', member_id: null, account: null, position: 0, splits: [], ...p
  };
}

describe('monthlyAmount', () => {
  it('laisse un montant mensuel intact', () => {
    expect(monthlyAmount({ amount: 1620, frequency: 'monthly' })).toBe(1620);
  });
  it('divise un montant annuel par 12', () => {
    expect(monthlyAmount({ amount: 1200, frequency: 'yearly' })).toBe(100);
  });
});

describe('ordre des opérations : mensualisation avant répartition', () => {
  it('répartit 1200/an 50/50 en 50 par mois et par membre — jamais 600', () => {
    const t = tx({ amount: 1200, frequency: 'yearly', member_id: null });
    expect(shareOf(t, 'g', members)).toBe(50);
    expect(shareOf(t, 'i', members)).toBe(50);
  });

  it('répartit 1200/an 70/30 en 70 et 30 par mois', () => {
    const t = tx({
      amount: 1200, frequency: 'yearly', member_id: null,
      splits: [
        { transaction_id: 't', member_id: 'g', weight: 70 },
        { transaction_id: 't', member_id: 'i', weight: 30 }
      ]
    });
    expect(shareOf(t, 'g', members)).toBe(70);
    expect(shareOf(t, 'i', members)).toBe(30);
  });

  it('la somme des parts vaut toujours le montant mensuel', () => {
    const t = tx({ amount: 1000, frequency: 'yearly', member_id: null });
    const sum = members.reduce((a, m) => a + shareOf(t, m.id, members), 0);
    expect(sum).toBeCloseTo(monthlyAmount(t), 10);
  });
});

describe('splitWeights — défauts implicites', () => {
  it('sans split ni membre : parts égales', () => {
    expect([...splitWeights(tx({}), members).values()]).toEqual([1, 1]);
  });
  it('sans split, ligne rattachée : 100 % pour le membre', () => {
    const w = splitWeights(tx({ member_id: 'i' }), members);
    expect(w.get('i')).toBe(1);
    expect(w.get('g')).toBeUndefined();
  });
  it('les splits explicites priment', () => {
    const t = tx({ member_id: 'g', splits: [{ transaction_id: 't', member_id: 'i', weight: 5 }] });
    expect(shareOf({ ...t, amount: 100 }, 'i', members)).toBe(100);
  });
  it('ignore les splits pointant un membre supprimé', () => {
    const t = tx({ amount: 100, splits: [{ transaction_id: 't', member_id: 'zz', weight: 9 }] });
    expect(shareOf(t, 'g', members)).toBe(50);
  });
});

describe('poids nuls', () => {
  it('retombe sur une répartition égale au lieu de perdre le montant', () => {
    const t = tx({
      amount: 100,
      splits: [
        { transaction_id: 't', member_id: 'g', weight: 0 },
        { transaction_id: 't', member_id: 'i', weight: 0 }
      ]
    });
    expect(shareOf(t, 'g', members)).toBe(50);
  });
});

describe('memberBreakdown', () => {
  const transactions = [
    tx({ id: '1', kind: 'income', amount: 4700, member_id: 'g', frequency: 'monthly' }),
    tx({ id: '2', kind: 'income', amount: 4900, member_id: 'i', frequency: 'monthly' }),
    tx({ id: '3', amount: 1620, member_id: null, frequency: 'monthly' }),   // loyer commun
    tx({ id: '4', amount: 1200, member_id: null, frequency: 'yearly' }),    // impôts annuels
    tx({ id: '5', amount: 49, member_id: 'g', frequency: 'monthly' }),      // fitness perso
    tx({ id: '6', amount: 140, member_id: 'i', frequency: 'yearly' })       // assurance perso
  ];

  it('déroule la cascade dans le bon ordre', () => {
    const b = memberBreakdown(transactions, g, members);
    expect(b.income).toBe(4700);
    expect(b.common).toBeCloseTo(1620 / 2 + 100 / 2, 10);
    expect(b.afterCommon).toBeCloseTo(b.income - b.common, 10);
    expect(b.personal).toBe(49);
    expect(b.remaining).toBeCloseTo(b.afterCommon - b.personal, 10);
  });

  it('le reste ménage égale la somme des restes individuels', () => {
    const total = members.reduce((a, m) => a + memberBreakdown(transactions, m, members).remaining, 0);
    expect(total).toBeCloseTo(householdSummary(transactions, members).remaining, 10);
  });
});

describe('sliderPercent', () => {
  it('vaut 50 par défaut sur une ligne commune', () => {
    expect(sliderPercent(tx({}), members)).toBe(50);
  });
  it('vaut 100 sur une ligne rattachée au membre #1', () => {
    expect(sliderPercent(tx({ member_id: 'g' }), members)).toBe(100);
  });
  it('normalise des poids qui ne somment pas à 100', () => {
    const t = tx({
      splits: [
        { transaction_id: 't', member_id: 'g', weight: 3 },
        { transaction_id: 't', member_id: 'i', weight: 1 }
      ]
    });
    expect(sliderPercent(t, members)).toBe(75);
  });
  it('renvoie null hors budget à deux membres', () => {
    expect(sliderPercent(tx({}), [g])).toBeNull();
  });
});

describe('incomeFlow', () => {
  it('découpe le revenu en commun, personnel de chacun, et reste', () => {
    const flow = incomeFlow(
      [
        tx({ id: 'a', kind: 'income', amount: 6000, member_id: 'g' }),
        tx({ id: 'b', kind: 'income', amount: 4000, member_id: 'i' }),
        tx({ id: 'c', amount: 2000, member_id: null }),
        tx({ id: 'd', amount: 500, member_id: 'g' }),
        tx({ id: 'e', amount: 300, member_id: 'i' })
      ],
      members
    );
    expect(flow.segments.map((s) => [s.key, s.amount])).toEqual([
      ['common', 2000],
      ['member:g', 500],
      ['member:i', 300],
      ['remaining', 7200]
    ]);
    expect(flow.overrun).toBe(0);
  });

  it('les segments totalisent exactement 100 % du revenu', () => {
    const flow = incomeFlow(
      [
        tx({ id: 'a', kind: 'income', amount: 9600, member_id: null }),
        tx({ id: 'b', amount: 1200, frequency: 'yearly', member_id: null }),
        tx({ id: 'c', amount: 700, member_id: 'g' })
      ],
      members
    );
    const total = flow.segments.reduce((a, s) => a + s.percent, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it('en déficit, la barre tient dans le cadre et annonce le dépassement', () => {
    const flow = incomeFlow(
      [
        tx({ id: 'a', kind: 'income', amount: 1000, member_id: null }),
        tx({ id: 'b', amount: 1500, member_id: null })
      ],
      members
    );
    expect(flow.overrun).toBe(500);
    // Aucun « Reste » à afficher, et les segments ne débordent pas de 100 %.
    expect(flow.segments.map((s) => s.key)).toEqual(['common']);
    expect(flow.segments.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(100, 10);
  });

  it('écarte les segments à zéro plutôt que de leur garder une place', () => {
    const flow = incomeFlow(
      [
        tx({ id: 'a', kind: 'income', amount: 1000, member_id: null }),
        tx({ id: 'b', amount: 400, member_id: null })
      ],
      members
    );
    expect(flow.segments.map((s) => s.key)).toEqual(['common', 'remaining']);
  });

  it('ne divise pas par zéro sur un budget vide', () => {
    const flow = incomeFlow([], members);
    expect(flow).toEqual({ income: 0, expenses: 0, overrun: 0, segments: [] });
  });
});

describe('memberFlow', () => {
  it('met chaque membre à l\'échelle de son propre revenu', () => {
    const rows = [
      tx({ id: 'a', kind: 'income', amount: 6000, member_id: 'g' }),
      tx({ id: 'b', kind: 'income', amount: 4000, member_id: 'i' }),
      tx({ id: 'c', amount: 2000, member_id: null }) // 1000 chacun
    ];
    const g1 = memberFlow(rows, g, members);
    const i1 = memberFlow(rows, i, members);

    // Même montant commun, mais pas le même effort : c'est ce que la barre doit montrer.
    expect(g1.common).toBe(1000);
    expect(i1.common).toBe(1000);
    expect(g1.used).toBeCloseTo(1000 / 6000 * 100, 10);
    expect(i1.used).toBeCloseTo(1000 / 4000 * 100, 10);
    expect(g1.segments.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(100, 10);
  });

  it('un membre sans revenu ne produit pas de NaN', () => {
    const flow = memberFlow([tx({ id: 'c', amount: 100, member_id: 'i' })], g, members);
    expect(Number.isFinite(flow.used)).toBe(true);
    expect(flow.used).toBe(0);
  });
});

describe('équilibrage de la charge commune', () => {
  /** Revenus inégaux, dépenses perso inégales, et 2000 de commun à partager. */
  const budget = [
    tx({ id: 'ri', kind: 'income', amount: 6000, member_id: 'g' }),
    tx({ id: 'rj', kind: 'income', amount: 4000, member_id: 'i' }),
    tx({ id: 'c1', amount: 1500, member_id: null }),
    tx({ id: 'c2', amount: 6000, frequency: 'yearly', member_id: null }), // 500/mois
    tx({ id: 'p1', amount: 800, member_id: 'g' }),
    tx({ id: 'p2', amount: 200, member_id: 'i' })
  ];

  it('égalise les restes', () => {
    const weights = balancedCommonWeights(budget, members);
    const rows = simulateCommonSplit(budget, members, weights);
    expect(rows[0].remaining).toBeCloseTo(rows[1].remaining, 8);

    // Disponible : 6000−800 = 5200 et 4000−200 = 3800, commun 2000.
    // Reste commun = (5200 + 3800 − 2000) / 2 = 3500 chacun.
    expect(rows[0].remaining).toBeCloseTo(3500, 8);
    expect(rows[0].common).toBeCloseTo(1700, 8);
    expect(rows[1].common).toBeCloseTo(300, 8);
  });

  it('les parts couvrent exactement le commun, ni plus ni moins', () => {
    const rows = simulateCommonSplit(budget, members, balancedCommonWeights(budget, members));
    expect(rows.reduce((a, r) => a + r.common, 0)).toBeCloseTo(commonTotal(budget), 8);
  });

  it('les poids sont des pourcentages qui totalisent 100', () => {
    const weights = balancedCommonWeights(budget, members);
    expect([...weights.values()].reduce((a, w) => a + w, 0)).toBeCloseTo(100, 8);
  });

  it('mensualise avant de répartir — 6000/an pèsent 500, pas 6000', () => {
    expect(commonTotal(budget)).toBe(2000);
  });

  it('à revenus et perso égaux, revient à 50/50', () => {
    const egal = [
      tx({ id: 'a', kind: 'income', amount: 5000, member_id: 'g' }),
      tx({ id: 'b', kind: 'income', amount: 5000, member_id: 'i' }),
      tx({ id: 'c', amount: 2000, member_id: null })
    ];
    const weights = balancedCommonWeights(egal, members);
    expect(weights.get('g')).toBeCloseTo(50, 8);
    expect(weights.get('i')).toBeCloseTo(50, 8);
  });

  it('ne fait jamais payer une part négative à qui ne peut pas suivre', () => {
    // Sam n'a que 100 de disponible : l'égalité parfaite exigerait que
    // Alex lui verse de l'argent. On la met à zéro à la place.
    const desequilibre = [
      tx({ id: 'a', kind: 'income', amount: 9000, member_id: 'g' }),
      tx({ id: 'b', kind: 'income', amount: 100, member_id: 'i' }),
      tx({ id: 'c', amount: 2000, member_id: null })
    ];
    const weights = balancedCommonWeights(desequilibre, members);
    expect(weights.get('i')).toBe(0);
    expect(weights.get('g')).toBeCloseTo(100, 8);

    const rows = simulateCommonSplit(desequilibre, members, weights);
    expect(rows.every((r) => r.common >= 0)).toBe(true);
    expect(rows.reduce((a, r) => a + r.common, 0)).toBeCloseTo(2000, 8);
  });

  it('simule sans rien écrire : les lignes reçues ne bougent pas', () => {
    const before = JSON.stringify(budget);
    simulateCommonSplit(budget, members, new Map([['g', 80], ['i', 20]]));
    balancedCommonWeights(budget, members);
    expect(JSON.stringify(budget)).toBe(before);
  });

  it('suit le curseur : à 100/0, l\'un porte tout le commun', () => {
    const rows = simulateCommonSplit(budget, members, new Map([['g', 100], ['i', 0]]));
    expect(rows[0].common).toBeCloseTo(2000, 8);
    expect(rows[1].common).toBe(0);
    expect(rows[1].remaining).toBeCloseTo(3800, 8);
  });

  it('poids tous nuls : parts égales plutôt qu\'une division par zéro', () => {
    const rows = simulateCommonSplit(budget, members, new Map([['g', 0], ['i', 0]]));
    expect(rows[0].common).toBeCloseTo(1000, 8);
    expect(rows[1].common).toBeCloseTo(1000, 8);
  });

  it('sans dépense commune, il n\'y a rien à équilibrer', () => {
    const sansCommun = [tx({ id: 'a', kind: 'income', amount: 5000, member_id: 'g' })];
    expect(commonTotal(sansCommun)).toBe(0);
    expect([...balancedCommonWeights(sansCommun, members).values()]).toEqual([50, 50]);
  });

  it('sans règle précisée, égalise le reste final', () => {
    expect(balancedCommonWeights(budget, members)).toEqual(
      balancedCommonWeights(budget, members, 'total')
    );
  });

  describe('règle « même reste après le commun »', () => {
    it('égalise le reste avant le personnel', () => {
      // Revenus 6000 et 4000, commun 2000 : (10000 − 2000) / 2 = 4000 chacun.
      const rows = simulateCommonSplit(budget, members, balancedCommonWeights(budget, members, 'common'));
      expect(rows[0].afterCommon).toBeCloseTo(4000, 8);
      expect(rows[1].afterCommon).toBeCloseTo(4000, 8);
      expect(rows[0].common).toBeCloseTo(2000, 8);
      expect(rows[1].common).toBeCloseTo(0, 8);
      // Le personnel vient ensuite, chacun le sien.
      expect(rows[0].remaining).toBeCloseTo(3200, 8);
      expect(rows[1].remaining).toBeCloseTo(3800, 8);
      expect(balanceSpread(rows, 'common')).toBeCloseTo(0, 8);
    });

    it('ignore les dépenses personnelles', () => {
      const plusDePerso = budget.map((t) => (t.id === 'p2' ? { ...t, amount: 1500 } : t));
      expect(balancedCommonWeights(plusDePerso, members, 'common')).toEqual(
        balancedCommonWeights(budget, members, 'common')
      );
    });

    it('ne fait jamais payer une part négative', () => {
      const desequilibre = [
        tx({ id: 'a', kind: 'income', amount: 9000, member_id: 'g' }),
        tx({ id: 'b', kind: 'income', amount: 100, member_id: 'i' }),
        tx({ id: 'c', amount: 2000, member_id: null })
      ];
      const weights = balancedCommonWeights(desequilibre, members, 'common');
      expect(weights.get('i')).toBe(0);
      expect(weights.get('g')).toBeCloseTo(100, 8);
    });
  });

  describe('règle « au prorata des revenus »', () => {
    it('chacun consacre la même part de son revenu', () => {
      const rows = simulateCommonSplit(budget, members, balancedCommonWeights(budget, members, 'income'));
      expect(rows[0].common).toBeCloseTo(1200, 8);
      expect(rows[1].common).toBeCloseTo(800, 8);
      expect(balanceSpread(rows, 'income')).toBeCloseTo(0, 8);
    });

    it('sans revenu, parts égales', () => {
      const sansRevenu = [tx({ id: 'c', amount: 2000, member_id: null })];
      expect([...balancedCommonWeights(sansRevenu, members, 'income').values()]).toEqual([50, 50]);
    });
  });

  describe('retrouver la règle appliquée', () => {
    /** Ce qu'écrit l'action `balanceCommon` : les parts, en base 10 000, sur chaque ligne commune. */
    const applied = (lines: Transaction[], rule: BalanceMode) => {
      const weights = balancedCommonWeights(lines, members, rule);
      const splits = members.map((m) => ({
        transaction_id: 't',
        member_id: m.id,
        weight: Math.round((weights.get(m.id) ?? 0) * 100)
      }));
      return lines.map((t) => (t.kind === 'expense' && t.member_id === null ? { ...t, splits } : t));
    };

    it.each(['common', 'total', 'income'] as BalanceMode[])('reconnaît la règle %s', (rule) => {
      expect(detectBalanceChoice(applied(budget, rule), members)).toBe(rule);
    });

    it('une répartition qu\'aucune règle n\'explique est libre', () => {
      // Parts égales implicites, alors que revenus et personnel diffèrent.
      expect(detectBalanceChoice(budget, members)).toBe('free');
    });

    it('si les montants ont bougé depuis, la règle ne tient plus : libre', () => {
      const lignes = applied(budget, 'common').map((t) => (t.id === 'rj' ? { ...t, amount: 5000 } : t));
      expect(detectBalanceChoice(lignes, members)).toBe('free');
    });

    it('lit la répartition en vigueur, toutes lignes communes confondues', () => {
      const weights = appliedCommonWeights(applied(budget, 'income'), members);
      expect(weights.get('g')).toBeCloseTo(60, 8);
      expect(weights.get('i')).toBeCloseTo(40, 8);
    });
  });

  it('mesure l\'écart de ce que la règle égalise', () => {
    const rows = simulateCommonSplit(budget, members, new Map([['g', 50], ['i', 50]]));
    // 1000 chacun : après commun 5000 / 3000, restes 4200 / 2800, effort 16,7 % / 25 %.
    expect(balanceSpread(rows, 'common')).toBeCloseTo(2000, 8);
    expect(balanceSpread(rows, 'total')).toBeCloseTo(1400, 8);
    expect(balanceSpread(rows, 'income')).toBeCloseTo(25 - 100 / 6, 8);
  });
});

describe('éditeur de répartition', () => {
  const s: BudgetMember = {
    id: 's', budget_id: 'b', user_id: null, invite_email: null, display_name: 'Sam', position: 3
  };
  const trio = [g, i, s];
  const split = (weights: Record<string, number>) =>
    Object.entries(weights).map(([member_id, weight]) => ({ transaction_id: 't', member_id, weight }));
  const values = (m: Map<string, number>) => [...m.values()];

  it('des pourcentages entiers qui totalisent toujours 100', () => {
    expect(values(wholePercents(new Map([['g', 1], ['i', 1], ['s', 1]]), trio))).toEqual([34, 33, 33]);
    expect(values(wholePercents(new Map(), trio)).reduce((a, p) => a + p, 0)).toBe(100);
    expect(values(splitPercents(tx({ splits: split({ g: 2, i: 1 }) }), members))).toEqual([67, 33]);
  });

  it('rééquilibre les autres en proportion, la valeur saisie restant intacte', () => {
    const before = new Map([['g', 50], ['i', 30], ['s', 20]]);
    const after = rebalance(before, trio, 'g', 60);
    expect(after.get('g')).toBe(60);
    expect(after.get('i')).toBe(24);
    expect(after.get('s')).toBe(16);
    expect(values(after).reduce((a, p) => a + p, 0)).toBe(100);
  });

  it('partage le reste à égalité quand les autres étaient à zéro', () => {
    const after = rebalance(new Map([['g', 100], ['i', 0], ['s', 0]]), trio, 'g', 40);
    expect(values(after)).toEqual([40, 30, 30]);
  });

  it('borne la saisie entre 0 et 100', () => {
    expect(values(rebalance(new Map([['g', 50], ['i', 50]]), members, 'g', 140))).toEqual([100, 0]);
    expect(values(rebalance(new Map([['g', 50], ['i', 50]]), members, 'g', -5))).toEqual([0, 100]);
  });

  it('proportionne au revenu mensualisé de chacun', () => {
    const rows = [
      tx({ id: 'a', kind: 'income', amount: 6000, member_id: 'g' }),
      tx({ id: 'b', kind: 'income', amount: 48000, frequency: 'yearly', member_id: 'i' })
    ];
    const weights = incomeWeights(rows, members)!;
    expect(values(wholePercents(weights, members))).toEqual([60, 40]);
    expect(incomeWeights([], members)).toBeNull();
  });

  it('reconnaît la répartition d\'une ligne', () => {
    const rows = [
      tx({ id: 'a', kind: 'income', amount: 6000, member_id: 'g' }),
      tx({ id: 'b', kind: 'income', amount: 4000, member_id: 'i' })
    ];
    expect(splitPreset(tx({}), rows, members)).toBe('equal');
    expect(splitPreset(tx({ member_id: 'i' }), rows, members)).toBe('only:i');
    expect(splitPreset(tx({ splits: split({ g: 6000, i: 4000 }) }), rows, members)).toBe('income');
    expect(splitPreset(tx({ splits: split({ g: 70, i: 30 }) }), rows, members)).toBe('custom');
  });

  it('repère des poids qui ne disent rien de plus que le défaut', () => {
    expect(isDefaultSplit(null, new Map([['g', 50], ['i', 50]]), members)).toBe(true);
    expect(isDefaultSplit(null, new Map([['g', 60], ['i', 40]]), members)).toBe(false);
    expect(isDefaultSplit('g', new Map([['g', 100], ['i', 0]]), members)).toBe(true);
    expect(isDefaultSplit('g', new Map([['g', 50], ['i', 50]]), members)).toBe(false);
  });
});
