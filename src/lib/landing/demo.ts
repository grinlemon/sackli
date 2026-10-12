import { COLOR_PRESETS } from '$lib/budget/colors';
import type { BudgetCategory, BudgetMember, Frequency, Transaction, TxKind } from '$lib/types';

/**
 * Les foyers fictifs des encadrés de la landing page. Ils passent par les mêmes
 * fonctions que l'app (`calc.ts`, `sankey.ts`) : ce que la page montre est ce
 * que l'app calculerait, pas une maquette dessinée à la main.
 *
 * Aucune donnée réelle : des montants plausibles pour la Suisse, rien de plus.
 */
const BUDGET = 'demo';

/**
 * Le jeu par défaut, réduit aux racines et sous-catégories dont la démo se sert.
 * Le nombre est l'indice de la racine dans le jeu complet, donc dans `COLOR_PRESETS`.
 */
const TREE: [string, number, string[]][] = [
  ['Revenu', 0, ['Salaire']],
  ['Logement', 1, ['Loyer', 'Assurances logement']],
  ['Santé', 2, ['Assurance maladie']],
  ['Alimentation', 4, ['Courses']],
  ['Abonnements', 5, ['Télécom']],
  ['Loisirs', 6, ['Vacances']],
  ['Épargne & réserves', 8, ['Épargne & placements']]
];

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-');

export const DEMO_CATEGORIES: BudgetCategory[] = TREE.flatMap(([root, preset, children], i) => [
  { id: slug(root), budget_id: BUDGET, parent_id: null, name: root, color: COLOR_PRESETS[preset], position: i },
  ...children.map((name, j) => ({
    id: `${slug(root)}/${slug(name)}`,
    budget_id: BUDGET,
    parent_id: slug(root),
    name,
    color: null,
    position: j
  }))
]);

export type HouseholdSize = 1 | 2 | 3;

const NAMES = ['Alex', 'Sam', 'Noa'];
const SALARIES = [6200, 4800, 5300];

/** Ce qui grandit avec le foyer, mais moins vite que lui. */
const SCALE: Record<HouseholdSize, { rent: number; food: number; telecom: number; home: number; trips: number; savings: number }> = {
  1: { rent: 1650, food: 520, telecom: 75, home: 360, trips: 2400, savings: 500 },
  2: { rent: 2350, food: 950, telecom: 110, home: 480, trips: 4200, savings: 700 },
  3: { rent: 2950, food: 1350, telecom: 140, home: 600, trips: 5400, savings: 900 }
};

export interface Household {
  members: BudgetMember[];
  transactions: Transaction[];
}

/** Un foyer neuf à chaque appel : chaque encadré joue avec le sien. */
export function demoHousehold(size: HouseholdSize): Household {
  const members: BudgetMember[] = NAMES.slice(0, size).map((name, i) => ({
    id: slug(name),
    budget_id: BUDGET,
    user_id: null,
    invite_email: null,
    display_name: name,
    position: i
  }));

  let seq = 0;
  const line = (
    name: string,
    amount: number,
    category: string,
    opts: { kind?: TxKind; frequency?: Frequency; member?: string | null } = {}
  ): Transaction => ({
    id: `tx${++seq}`,
    budget_id: BUDGET,
    name,
    kind: opts.kind ?? 'expense',
    amount,
    category_id: category,
    frequency: opts.frequency ?? 'monthly',
    // Seul, il n'y a ni commun ni personnel : tout est à soi.
    member_id: size === 1 ? null : (opts.member ?? null),
    account: null,
    position: seq,
    splits: []
  });

  const s = SCALE[size];
  const solo = size === 1;
  return {
    members,
    transactions: [
      ...members.map((m, i) =>
        line(solo ? 'Salaire' : `Salaire ${m.display_name}`, SALARIES[i], 'revenu/salaire', { kind: 'income', member: m.id })
      ),
      line('Loyer', s.rent, 'logement/loyer'),
      line('Courses', s.food, 'alimentation/courses'),
      line('Assurance ménage & RC', s.home, 'logement/assurances-logement', { frequency: 'yearly' }),
      ...members.map((m, i) =>
        line(solo ? 'Assurance maladie' : `Assurance maladie ${m.display_name}`, [412, 398, 385][i], 'sante/assurance-maladie', {
          member: m.id
        })
      ),
      line('Internet & mobiles', s.telecom, 'abonnements/telecom'),
      line('Vacances', s.trips, 'loisirs/vacances', { frequency: 'yearly' }),
      line('Épargne', s.savings, 'epargne-reserves/epargne-placements')
    ]
  };
}
