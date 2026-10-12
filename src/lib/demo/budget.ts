import { COLOR_PRESETS } from '$lib/budget/colors';
import type { BudgetCategory, BudgetMember, Frequency, Transaction, TransactionSplit, TxKind } from '$lib/types';

/**
 * Le budget de la démo (`/demo`) : ce qu'un visiteur manipule sans compte.
 * Il vit dans l'onglet et nulle part ailleurs — aucune ligne n'est jamais
 * écrite en base (voir `BudgetState`, construit sans client Supabase).
 *
 * Un couple aux revenus différents, exprès : c'est là que la répartition au
 * prorata des revenus prend tout son sens, et la démo doit le montrer.
 * Des montants plausibles pour la Suisse, aucune donnée réelle.
 */
export const DEMO_BUDGET = { id: 'demo', name: 'Budget démo' };

/**
 * Le jeu de catégories par défaut, tel que le sème la migration
 * `20260921161500_categories_taxonomy.sql`. Troisième copie, après la
 * migration et `COLOR_PRESETS` : la démo n'a pas de base où le lire. Un test
 * la compare à la migration, pour qu'elle ne dérive pas en silence.
 */
export const DEFAULT_TAXONOMY: [string, string[]][] = [
  ['Revenu', ['Salaire', 'Revenus variables']],
  ['Logement', ['Loyer', 'Énergie', 'Assurances logement', 'Entretien']],
  ['Santé', ['Assurance maladie', 'Franchise & réserves', 'Soins']],
  ['Transport', ['Assurances & plaques', 'Carburant', 'Entretien & réparations', 'Transports publics & parking']],
  ['Alimentation', ['Courses', 'Restaurants & take-away']],
  ['Abonnements', ['Télécom', 'Streaming & médias']],
  ['Loisirs', ['Sport', 'Sorties & culture', 'Vacances']],
  ['Impôts & taxes', ['Impôts', 'Taxes']],
  ['Épargne & réserves', ['Épargne & placements', 'Réserves']],
  ['Divers', ['Animaux', 'Cadeaux', 'Imprévus']]
];

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const DEMO_CATEGORIES: BudgetCategory[] = DEFAULT_TAXONOMY.flatMap(([root, children], i) => [
  { id: slug(root), budget_id: DEMO_BUDGET.id, parent_id: null, name: root, color: COLOR_PRESETS[i], position: i },
  ...children.map((name, j) => ({
    id: `${slug(root)}/${slug(name)}`,
    budget_id: DEMO_BUDGET.id,
    parent_id: slug(root),
    name,
    color: null,
    position: j
  }))
]);

const ALEX = 'alex';
const SAM = 'sam';
const SALARY = { [ALEX]: 6800, [SAM]: 4900 };

export const DEMO_MEMBERS: BudgetMember[] = [
  { id: ALEX, budget_id: DEMO_BUDGET.id, user_id: null, invite_email: null, display_name: 'Alex', position: 0 },
  { id: SAM, budget_id: DEMO_BUDGET.id, user_id: null, invite_email: null, display_name: 'Sam', position: 1 }
];

/** Poids au prorata des salaires, sur la base de 10 000 de l'équilibrage. */
const BY_INCOME = {
  [ALEX]: Math.round((SALARY[ALEX] / (SALARY[ALEX] + SALARY[SAM])) * 10000),
  [SAM]: Math.round((SALARY[SAM] / (SALARY[ALEX] + SALARY[SAM])) * 10000)
};

/** Des lignes neuves à chaque appel : réinitialiser la démo repart de zéro. */
export function demoTransactions(): Transaction[] {
  let seq = 0;
  const line = (
    name: string,
    amount: number,
    category: string,
    opts: { kind?: TxKind; frequency?: Frequency; member?: string; byIncome?: boolean } = {}
  ): Transaction => {
    const id = `demo-${++seq}`;
    const member = opts.member ?? null;
    const splits: TransactionSplit[] = opts.byIncome
      ? DEMO_MEMBERS.map((m) => ({ transaction_id: id, member_id: m.id, weight: BY_INCOME[m.id as keyof typeof BY_INCOME] }))
      : [];
    return {
      id,
      budget_id: DEMO_BUDGET.id,
      name,
      kind: opts.kind ?? 'expense',
      amount,
      category_id: category,
      frequency: opts.frequency ?? 'monthly',
      member_id: member,
      account: member === ALEX ? 'UBS' : member === SAM ? 'PostFinance' : 'Compte commun',
      position: seq,
      splits
    };
  };

  return [
    line('Salaire Alex', SALARY[ALEX], 'revenu/salaire', { kind: 'income', member: ALEX }),
    line('Salaire Sam', SALARY[SAM], 'revenu/salaire', { kind: 'income', member: SAM }),

    line('Loyer', 2150, 'logement/loyer', { byIncome: true }),
    line('Charges & chauffage', 180, 'logement/energie'),
    line('Électricité', 75, 'logement/energie'),
    line('Assurance ménage & RC', 480, 'logement/assurances-logement', { frequency: 'yearly' }),

    line('Assurance maladie Alex', 389, 'sante/assurance-maladie', { member: ALEX }),
    line('Assurance maladie Sam', 412, 'sante/assurance-maladie', { member: SAM }),
    line('Franchise Alex', 1500, 'sante/franchise-reserves', { frequency: 'yearly', member: ALEX }),
    line('Dentiste', 600, 'sante/soins', { frequency: 'yearly' }),

    line('Assurance voiture', 960, 'transport/assurances-plaques', { frequency: 'yearly' }),
    line('Essence', 140, 'transport/carburant'),
    line('Abonnement transports Alex', 85, 'transport/transports-publics-parking', { member: ALEX }),
    line('Demi-tarif Sam', 190, 'transport/transports-publics-parking', { frequency: 'yearly', member: SAM }),

    line('Courses', 950, 'alimentation/courses'),
    line('Restaurants', 220, 'alimentation/restaurants-take-away'),

    line('Internet', 55, 'abonnements/telecom'),
    line('Mobile Alex', 35, 'abonnements/telecom', { member: ALEX }),
    line('Mobile Sam', 29, 'abonnements/telecom', { member: SAM }),
    line('Streaming', 32, 'abonnements/streaming-medias'),
    line('Redevance Serafe', 335, 'abonnements/streaming-medias', { frequency: 'yearly' }),

    line('Fitness Sam', 79, 'loisirs/sport', { member: SAM }),
    line('Sorties', 200, 'loisirs/sorties-culture'),
    line('Vacances', 4800, 'loisirs/vacances', { frequency: 'yearly' }),

    line('Impôts', 9600, 'impots-taxes/impots', { frequency: 'yearly', byIncome: true }),
    line('Taxe déchets', 120, 'impots-taxes/taxes', { frequency: 'yearly' }),

    line('Pilier 3a Alex', 7258, 'epargne-reserves/epargne-placements', { frequency: 'yearly', member: ALEX }),
    line('Pilier 3a Sam', 3600, 'epargne-reserves/epargne-placements', { frequency: 'yearly', member: SAM }),
    line('Épargne commune', 400, 'epargne-reserves/epargne-placements', { byIncome: true }),

    line('Cadeaux', 900, 'divers/cadeaux', { frequency: 'yearly' }),
    line('Imprévus', 100, 'divers/imprevus')
  ];
}
