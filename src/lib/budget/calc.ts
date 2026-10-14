import type { BudgetMember, Transaction } from '$lib/types';

/**
 * Montant ramené au mois. TOUT passe par ici : la répartition entre membres
 * s'applique ensuite sur ce résultat, jamais sur le montant annuel brut.
 */
export function monthlyAmount(tx: Pick<Transaction, 'amount' | 'frequency'>): number {
  return tx.frequency === 'yearly' ? tx.amount / 12 : tx.amount;
}

/**
 * Poids de répartition par membre.
 * Les splits explicites priment ; sinon on applique le défaut implicite :
 * 100 % pour le membre rattaché, ou parts égales si la ligne est commune.
 * On ne stocke des lignes que lorsque l'utilisateur bouge le curseur.
 */
export function splitWeights(tx: Transaction, members: BudgetMember[]): Map<string, number> {
  const known = new Set(members.map((m) => m.id));
  const explicit = (tx.splits ?? []).filter((s) => known.has(s.member_id));

  if (explicit.length > 0) {
    return new Map(explicit.map((s) => [s.member_id, Math.max(s.weight, 0)]));
  }
  if (tx.member_id && known.has(tx.member_id)) {
    return new Map([[tx.member_id, 1]]);
  }
  return new Map(members.map((m) => [m.id, 1]));
}

/** Part mensuelle d'un membre sur une ligne. */
export function shareOf(tx: Transaction, memberId: string, members: BudgetMember[]): number {
  if (members.length === 0) return 0;
  const monthly = monthlyAmount(tx);
  const weights = splitWeights(tx, members);
  const total = [...weights.values()].reduce((a, w) => a + w, 0);

  // Poids tous nuls : on retombe sur une répartition égale plutôt que de perdre le montant.
  if (total <= 0) return monthly / members.length;
  return (monthly * (weights.get(memberId) ?? 0)) / total;
}

export interface MemberBreakdown {
  member: BudgetMember;
  income: number;
  common: number;
  afterCommon: number;
  personal: number;
  remaining: number;
}

/** La cascade affichée dans la vue Analyse, pour un membre. */
export function memberBreakdown(
  transactions: Transaction[],
  member: BudgetMember,
  members: BudgetMember[]
): MemberBreakdown {
  let income = 0;
  let common = 0;
  let personal = 0;

  for (const tx of transactions) {
    const share = shareOf(tx, member.id, members);
    if (tx.kind === 'income') income += share;
    else if (tx.member_id === null) common += share;
    else personal += share;
  }

  const afterCommon = income - common;
  return { member, income, common, afterCommon, personal, remaining: afterCommon - personal };
}

export interface HouseholdSummary {
  income: number;
  expenses: number;
  common: number;
  remaining: number;
}

export function householdSummary(
  transactions: Transaction[],
  members: BudgetMember[]
): HouseholdSummary {
  let income = 0;
  let expenses = 0;
  let common = 0;

  for (const tx of transactions) {
    const monthly = monthlyAmount(tx);
    if (tx.kind === 'income') income += monthly;
    else {
      expenses += monthly;
      if (tx.member_id === null) common += monthly;
    }
  }

  return { income, expenses, common, remaining: income - expenses };
}

/** Total mensuel personnel d'un membre, tous membres confondus (vue Analyse). */
export function personalTotal(
  transactions: Transaction[],
  member: BudgetMember,
  members: BudgetMember[]
): number {
  return transactions
    .filter((tx) => tx.kind === 'expense' && tx.member_id !== null)
    .reduce((a, tx) => a + shareOf(tx, member.id, members), 0);
}

/**
 * Position du curseur pour un budget à deux membres : part du membre #1, en %.
 * Renvoie null si le budget n'a pas exactement deux membres (l'UI bascule alors
 * sur des champs numériques par membre).
 */
export function sliderPercent(tx: Transaction, members: BudgetMember[]): number | null {
  if (members.length !== 2) return null;
  const weights = splitWeights(tx, members);
  const a = weights.get(members[0].id) ?? 0;
  const b = weights.get(members[1].id) ?? 0;
  const total = a + b;
  if (total <= 0) return 50;
  return Math.round((a / total) * 100);
}

/** Poids par défaut à écrire lorsqu'on rattache une ligne (100/0 perso, égal si commun). */
export function defaultWeights(memberId: string | null, members: BudgetMember[]): Map<string, number> {
  if (memberId) return new Map(members.map((m) => [m.id, m.id === memberId ? 100 : 0]));
  const equal = members.length ? Math.round(100 / members.length) : 0;
  return new Map(members.map((m) => [m.id, equal]));
}

export interface FlowSegment {
  key: string;
  label: string;
  amount: number;
  /** Largeur du segment, en % de la barre. */
  percent: number;
}

export interface IncomeFlow {
  income: number;
  expenses: number;
  segments: FlowSegment[];
  /** De combien les dépenses excèdent le revenu ; 0 si le budget tient. */
  overrun: number;
}

/** Un segment nul n'a rien à montrer et volerait sa place à une étiquette. */
function scaled(
  raw: { key: string; label: string; amount: number }[],
  scale: number
): FlowSegment[] {
  return raw
    .filter((s) => s.amount > 0)
    .map((s) => ({ ...s, percent: (s.amount / scale) * 100 }));
}

/**
 * Comment le revenu du ménage se consomme : dépenses communes, dépenses
 * personnelles de chacun, puis ce qui reste. Les trois parts totalisent
 * exactement les dépenses, et avec le reste, exactement le revenu — les parts
 * personnelles passent par `shareOf`, dont la somme vaut le montant mensuel.
 *
 * L'échelle est le plus grand des deux, revenu ou dépenses : en déficit la
 * barre représente les dépenses et `overrun` dit de combien elles débordent,
 * au lieu de laisser des segments sortir du cadre sans le dire.
 */
export function incomeFlow(transactions: Transaction[], members: BudgetMember[]): IncomeFlow {
  const { income, expenses } = householdSummary(transactions, members);
  const common = transactions
    .filter((tx) => tx.kind === 'expense' && tx.member_id === null)
    .reduce((a, tx) => a + monthlyAmount(tx), 0);

  return {
    income,
    expenses,
    overrun: Math.max(expenses - income, 0),
    segments: scaled(
      [
        { key: 'common', label: 'Commun', amount: common },
        ...members.map((m) => ({
          key: `member:${m.id}`,
          label: m.display_name,
          amount: personalTotal(transactions, m, members)
        })),
        { key: 'remaining', label: 'Reste', amount: Math.max(income - expenses, 0) }
      ],
      Math.max(income, expenses, 1)
    )
  };
}

export interface MemberFlow extends MemberBreakdown {
  /** Part de son revenu absorbée par le budget, en % — peut dépasser 100. */
  used: number;
  segments: FlowSegment[];
}

/**
 * Le même découpage, mais à l'échelle du revenu d'**un** membre. C'est ce qui
 * rend deux membres comparables quand leurs revenus diffèrent : chaque barre
 * vaut 100 % de ce que la personne gagne, pas une fraction du ménage.
 */
export function memberFlow(
  transactions: Transaction[],
  member: BudgetMember,
  members: BudgetMember[]
): MemberFlow {
  const breakdown = memberBreakdown(transactions, member, members);
  const spent = breakdown.common + breakdown.personal;

  return {
    ...breakdown,
    used: breakdown.income > 0 ? (spent / breakdown.income) * 100 : 0,
    segments: scaled(
      [
        { key: 'common', label: 'Commun', amount: breakdown.common },
        { key: 'personal', label: 'Personnel', amount: breakdown.personal },
        { key: 'remaining', label: 'Reste', amount: Math.max(breakdown.remaining, 0) }
      ],
      Math.max(breakdown.income, spent, 1)
    )
  };
}

export interface BalanceRow {
  member: BudgetMember;
  income: number;
  personal: number;
  /** Part des dépenses communes qui lui reviendrait avec la répartition simulée. */
  common: number;
  /** Revenu moins sa part du commun, avant ses dépenses personnelles. */
  afterCommon: number;
  remaining: number;
}

/**
 * La règle d'équilibrage du commun :
 * - `common` : même reste une fois le commun payé, le personnel venant ensuite ;
 * - `total`  : même reste une fois **tout** payé, commun et personnel ;
 * - `income` : chacun consacre la même part de son revenu au commun.
 */
export type BalanceMode = 'common' | 'total' | 'income';

/** Revenu moins dépenses personnelles : ce dont le membre dispose pour le commun. */
function availableFor(
  transactions: Transaction[],
  member: BudgetMember,
  members: BudgetMember[]
): { income: number; personal: number } {
  let income = 0;
  let personal = 0;
  for (const tx of transactions) {
    if (tx.kind === 'income') income += shareOf(tx, member.id, members);
    else if (tx.member_id !== null) personal += shareOf(tx, member.id, members);
  }
  return { income, personal };
}

/** Total mensuel des dépenses communes — l'assiette que la répartition partage. */
export function commonTotal(transactions: Transaction[]): number {
  return transactions
    .filter((tx) => tx.kind === 'expense' && tx.member_id === null)
    .reduce((a, tx) => a + monthlyAmount(tx), 0);
}

/**
 * Ce que deviendrait le reste de chacun si **toutes** les lignes communes
 * suivaient la même répartition. C'est une projection : rien n'est écrit, et la
 * fonction ne lit que des montants déjà en base.
 *
 * Revenus et dépenses personnelles ne bougent pas avec la répartition du
 * commun — seule la part commune varie, d'où le calcul séparé.
 */
export function simulateCommonSplit(
  transactions: Transaction[],
  members: BudgetMember[],
  weights: Map<string, number>
): BalanceRow[] {
  const common = commonTotal(transactions);
  const total = members.reduce((a, m) => a + Math.max(weights.get(m.id) ?? 0, 0), 0);

  return members.map((member) => {
    const { income, personal } = availableFor(transactions, member, members);
    // Poids tous nuls : parts égales, le même repli que `shareOf`.
    const part =
      total > 0 ? Math.max(weights.get(member.id) ?? 0, 0) / total : 1 / Math.max(members.length, 1);
    const share = common * part;
    return {
      member,
      income,
      personal,
      common: share,
      afterCommon: income - share,
      remaining: income - share - personal
    };
  });
}

/**
 * La répartition des dépenses communes selon la règle choisie (`BalanceMode`),
 * en pourcentages qui totalisent 100.
 *
 * `income` : au prorata des revenus (`incomeWeights`), parts égales sans revenu.
 *
 * `common` et `total` égalisent un reste : `reste_i = disponible_i − part_i`,
 * où le disponible vaut le revenu (`common`) ou le revenu moins le personnel
 * (`total`), et les parts totalisent le commun. Les rendre tous égaux à R donne
 * `R = (Σ disponible_i − commun) / n`, puis `part_i = disponible_i − R`.
 *
 * Un membre dont le disponible est inférieur à R devrait recevoir une part
 * négative, c'est-à-dire être payé par les autres. On le met à zéro et on
 * recommence sans lui : le reste ne sera pas parfaitement égal, mais personne
 * ne reçoit d'argent du pot commun.
 */
export function balancedCommonWeights(
  transactions: Transaction[],
  members: BudgetMember[],
  mode: BalanceMode = 'total'
): Map<string, number> {
  const equal = new Map(members.map((m) => [m.id, members.length ? 100 / members.length : 0]));
  const common = commonTotal(transactions);
  if (members.length === 0 || common <= 0) return equal;

  if (mode === 'income') {
    const byIncome = incomeWeights(transactions, members);
    if (!byIncome) return equal;
    return new Map(members.map((m) => [m.id, (byIncome.get(m.id) ?? 0) / 100]));
  }

  const available = new Map(
    members.map((m) => {
      const { income, personal } = availableFor(transactions, m, members);
      return [m.id, mode === 'total' ? income - personal : income];
    })
  );

  const excluded = new Set<string>();
  for (let guard = 0; guard <= members.length; guard++) {
    const active = members.filter((m) => !excluded.has(m.id));
    if (active.length === 0) return equal;

    const rest = (active.reduce((a, m) => a + (available.get(m.id) ?? 0), 0) - common) / active.length;
    const parts = active.map((m) => ({ id: m.id, part: (available.get(m.id) ?? 0) - rest }));

    const worst = parts.reduce((a, b) => (b.part < a.part ? b : a));
    if (worst.part >= 0) {
      const weights = new Map(members.map((m) => [m.id, 0]));
      for (const { id, part } of parts) weights.set(id, (part / common) * 100);
      return weights;
    }
    excluded.add(worst.id);
  }
  return equal;
}

/** Une règle de calcul, ou `free` : les parts posées à la main au curseur. */
export type BalanceChoice = BalanceMode | 'free';

/**
 * La répartition du commun réellement en vigueur, en % : la part de chacun dans
 * le total commun, toutes lignes confondues. Parts égales sans commun.
 */
export function appliedCommonWeights(
  transactions: Transaction[],
  members: BudgetMember[]
): Map<string, number> {
  const total = commonTotal(transactions);
  if (total <= 0 || members.length === 0) {
    return new Map(members.map((m) => [m.id, members.length ? 100 / members.length : 0]));
  }
  return new Map(
    members.map((m) => [m.id, (memberBreakdown(transactions, m, members).common / total) * 100])
  );
}

/**
 * La règle que suit la répartition en vigueur, retrouvée en recalculant chacune.
 * C'est ce qui permet de rouvrir l'écran sur la règle choisie **sans la
 * stocker** : seules les parts sont en base, et elles suffisent à la reconnaître.
 *
 * Les parts sont écrites au centième de pourcent : la tolérance couvre cet
 * arrondi, rien de plus. Si les montants ont bougé depuis, plus aucune règle ne
 * tombe juste et l'on retombe sur `free` — ce qui est exact : la répartition
 * appliquée ne suit plus la règle. Quand plusieurs règles coïncident (revenus
 * égaux, aucun personnel), la première de `rules` l'emporte, et ses parts sont
 * de toute façon les mêmes.
 */
export function detectBalanceChoice(
  transactions: Transaction[],
  members: BudgetMember[],
  rules: BalanceMode[] = ['common', 'total', 'income']
): BalanceChoice {
  const applied = appliedCommonWeights(transactions, members);
  const close = (a: Map<string, number>) =>
    members.every((m) => Math.abs((a.get(m.id) ?? 0) - (applied.get(m.id) ?? 0)) < 0.02);
  return rules.find((rule) => close(balancedCommonWeights(transactions, members, rule))) ?? 'free';
}

/**
 * Écart, entre membres, de ce que la règle cherche à égaliser : le reste après
 * le commun (`common`), le reste final (`total`, et `free` qui ne vise rien), ou la part du revenu
 * consacrée au commun, en points de pourcentage (`income`). Zéro = règle tenue.
 * Un membre sans revenu n'a pas d'effort mesurable : il sort du calcul en `income`.
 */
export function balanceSpread(rows: BalanceRow[], mode: BalanceChoice): number {
  const values =
    mode === 'income'
      ? rows.filter((r) => r.income > 0).map((r) => (r.common / r.income) * 100)
      : rows.map((r) => (mode === 'common' ? r.afterCommon : r.remaining));
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * Partage `total` (entier) en entiers proportionnels à `exact`, par la méthode
 * du plus fort reste : la somme tombe juste, là où arrondir chaque part
 * séparément donnerait 33 · 33 · 33 — un total de 99 que personne n'a saisi.
 */
function apportion(exact: number[], total: number): number[] {
  const sum = exact.reduce((a, v) => a + v, 0);
  const scaled = sum > 0 ? exact.map((v) => (v / sum) * total) : exact.map(() => total / exact.length);
  const floors = scaled.map(Math.floor);
  let missing = total - floors.reduce((a, v) => a + v, 0);
  const order = scaled
    .map((v, index) => ({ index, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (missing <= 0) break;
    floors[index] += 1;
    missing -= 1;
  }
  return floors;
}

/** Des poids en pourcentages entiers qui totalisent exactement 100. */
export function wholePercents(weights: Map<string, number>, members: BudgetMember[]): Map<string, number> {
  if (members.length === 0) return new Map();
  const parts = apportion(members.map((m) => Math.max(weights.get(m.id) ?? 0, 0)), 100);
  return new Map(members.map((m, k) => [m.id, parts[k]]));
}

/** La répartition d'une ligne en pourcentages entiers, total 100. */
export function splitPercents(tx: Transaction, members: BudgetMember[]): Map<string, number> {
  return wholePercents(splitWeights(tx, members), members);
}

/**
 * Fixe la part d'un membre et redistribue le reste aux autres **en proportion
 * de ce qu'ils avaient**. C'est ce qui rend l'éditeur utilisable à trois : sans
 * ce rééquilibrage, passer quelqu'un à 50 % laissait un total de 116 %, que
 * `shareOf` normalisait en silence — on lisait 43 % juste après avoir tapé 50.
 *
 * Si les autres étaient tous à zéro, le reste se partage entre eux à parts égales.
 */
export function rebalance(
  percents: Map<string, number>,
  members: BudgetMember[],
  memberId: string,
  value: number
): Map<string, number> {
  if (members.length <= 1) return new Map(members.map((m) => [m.id, 100]));
  const fixed = Math.min(100, Math.max(0, Math.round(value)));
  const others = members.filter((m) => m.id !== memberId);
  // Le membre visé est épinglé : seul l'arrondi des autres absorbe l'écart,
  // la valeur saisie n'est jamais retouchée.
  const parts = apportion(others.map((m) => Math.max(percents.get(m.id) ?? 0, 0)), 100 - fixed);
  const next = new Map(others.map((m, k) => [m.id, parts[k]]));
  next.set(memberId, fixed);
  return new Map(members.map((m) => [m.id, next.get(m.id) ?? 0]));
}

/**
 * Poids proportionnels au revenu mensuel de chacun, sur une base de 10 000 —
 * comme `balancedCommonWeights`, pour rester juste au centime malgré le
 * `smallint`. `null` si personne n'a de revenu : il n'y a rien à proportionner.
 */
export function incomeWeights(
  transactions: Transaction[],
  members: BudgetMember[]
): Map<string, number> | null {
  const incomes = members.map((m) => availableFor(transactions, m, members).income);
  const total = incomes.reduce((a, v) => a + Math.max(v, 0), 0);
  if (total <= 0) return null;
  return new Map(members.map((m, k) => [m.id, Math.round((Math.max(incomes[k], 0) / total) * 10000)]));
}

export type SplitPreset = 'equal' | 'income' | `only:${string}` | 'custom';

/**
 * Le nom de la répartition d'une ligne, pour le résumé de la grille et le
 * raccourci actif de l'éditeur. Comparée au pourcentage entier près : c'est la
 * précision qu'affiche l'éditeur, deux répartitions qui s'y lisent pareil sont
 * la même pour l'utilisateur.
 */
export function splitPreset(
  tx: Transaction,
  transactions: Transaction[],
  members: BudgetMember[]
): SplitPreset {
  const current = splitPercents(tx, members);
  const same = (other: Map<string, number>) => {
    const target = wholePercents(other, members);
    return members.every((m) => target.get(m.id) === current.get(m.id));
  };

  const single = members.find((m) => current.get(m.id) === 100);
  if (single && members.length > 1) return `only:${single.id}`;
  if (same(new Map(members.map((m) => [m.id, 1])))) return 'equal';
  const byIncome = incomeWeights(transactions, members);
  if (byIncome && same(byIncome)) return 'income';
  return 'custom';
}

/**
 * Vrai si ces poids ne disent rien de plus que le défaut implicite du modèle
 * (100 % pour le membre rattaché, parts égales si commun) : on supprime alors
 * les splits plutôt que d'écrire ce qui va de soi.
 */
export function isDefaultSplit(
  memberId: string | null,
  weights: Map<string, number>,
  members: BudgetMember[]
): boolean {
  const implicit = memberId
    ? new Map(members.map((m) => [m.id, m.id === memberId ? 1 : 0]))
    : new Map(members.map((m) => [m.id, 1]));
  const a = wholePercents(weights, members);
  const b = wholePercents(implicit, members);
  return members.every((m) => a.get(m.id) === b.get(m.id));
}
