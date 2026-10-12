import type { BudgetCategory, BudgetMember, Frequency, Transaction, TxKind } from '$lib/types';
import { monthlyAmount } from './calc';

/**
 * Filtres et tri de la grille, en fonctions pures — les composants n'en
 * dérivent rien eux-mêmes, ils affichent ce que ce module renvoie.
 *
 * Le tri ne touche jamais `position` : l'ordre de saisie reste la donnée, le
 * tri n'est qu'une vue. Trier sur `position` rend donc l'ordre saisi par
 * l'utilisateur, intact.
 */

export interface TxFilters {
  kind: 'all' | TxKind;
  /** Texte libre : nom, compte et nom de catégorie, accents ignorés. */
  search: string;
  /** `all`, `none` (non classé), ou l'id d'une catégorie — une racine embarque ses enfants. */
  categoryId: 'all' | 'none' | string;
  /** `all`, `common` (ligne commune), ou l'id d'un membre. */
  memberId: 'all' | 'common' | string;
  frequency: 'all' | Frequency;
  /** `all`, `none` (sans compte), ou le libellé exact du compte. */
  account: 'all' | 'none' | string;
  /** Bornes sur le montant **mensualisé**, pour comparer annuel et mensuel. */
  min: number | null;
  max: number | null;
}

export const EMPTY_FILTERS: TxFilters = {
  kind: 'all',
  search: '',
  categoryId: 'all',
  memberId: 'all',
  frequency: 'all',
  account: 'all',
  min: null,
  max: null
};

/** Vrai dès qu'un filtre restreint la vue — sert à proposer la remise à zéro. */
export function isFiltering(f: TxFilters): boolean {
  return (
    f.kind !== 'all' ||
    f.search.trim() !== '' ||
    f.categoryId !== 'all' ||
    f.memberId !== 'all' ||
    f.frequency !== 'all' ||
    f.account !== 'all' ||
    f.min !== null ||
    f.max !== null
  );
}

/** Minuscules sans accents : « Électricité » doit se trouver en tapant « electr ». */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** La catégorie visée plus, si c'est une racine, ses sous-catégories. */
function categoryScope(id: string, categories: BudgetCategory[]): Set<string> {
  const scope = new Set([id]);
  for (const c of categories) if (c.parent_id === id) scope.add(c.id);
  return scope;
}

function categoryName(id: string | null, categories: BudgetCategory[]): string {
  return categories.find((c) => c.id === id)?.name ?? '';
}

export function matches(tx: Transaction, f: TxFilters, categories: BudgetCategory[]): boolean {
  if (f.kind !== 'all' && tx.kind !== f.kind) return false;
  if (f.frequency !== 'all' && tx.frequency !== f.frequency) return false;

  if (f.categoryId === 'none') {
    if (tx.category_id !== null) return false;
  } else if (f.categoryId !== 'all') {
    if (!tx.category_id || !categoryScope(f.categoryId, categories).has(tx.category_id)) return false;
  }

  if (f.memberId === 'common') {
    if (tx.member_id !== null) return false;
  } else if (f.memberId !== 'all') {
    if (tx.member_id !== f.memberId) return false;
  }

  if (f.account === 'none') {
    if ((tx.account ?? '') !== '') return false;
  } else if (f.account !== 'all') {
    if ((tx.account ?? '') !== f.account) return false;
  }

  const monthly = monthlyAmount(tx);
  if (f.min !== null && monthly < f.min) return false;
  if (f.max !== null && monthly > f.max) return false;

  const needle = fold(f.search.trim());
  if (needle !== '') {
    const haystack = fold(
      [tx.name, tx.account ?? '', categoryName(tx.category_id, categories)].join(' ')
    );
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

export type SortKey =
  | 'default'
  | 'position'
  | 'kind'
  | 'name'
  | 'amount'
  | 'category'
  | 'frequency'
  | 'member'
  | 'monthly'
  | 'account';

export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/**
 * La vue par défaut : catégorie dans l'ordre d'affichage, puis montant mensuel
 * du plus petit au plus grand. Une ligne ajoutée rejoint donc sa famille et son
 * rang au lieu de s'empiler en bas de la grille.
 */
export const DEFAULT_SORT: Sort = { key: 'default', dir: 'asc' };

export interface SortContext {
  members: BudgetMember[];
  categories: BudgetCategory[];
}

/**
 * Rang d'une catégorie dans l'ordre d'affichage : position de la racine, puis
 * position de l'enfant. Trier par catégorie regroupe donc les lignes comme le
 * sélecteur les présente, au lieu de casser les familles par ordre alphabétique.
 */
function categoryRank(tx: Transaction, categories: BudgetCategory[]): [number, number] {
  const c = categories.find((x) => x.id === tx.category_id);
  if (!c) return [Infinity, Infinity];
  if (c.parent_id === null) return [c.position, -1];
  const parent = categories.find((x) => x.id === c.parent_id);
  return [parent?.position ?? Infinity, c.position];
}

function text(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

/** Une valeur « vide » reste en bas quel que soit le sens du tri. */
function isEmpty(tx: Transaction, key: SortKey): boolean {
  if (key === 'name') return tx.name.trim() === '';
  if (key === 'category' || key === 'default') return tx.category_id === null;
  if (key === 'account') return (tx.account ?? '').trim() === '';
  return false; // `member` : « Commun » est une valeur, pas un vide.
}

function compare(a: Transaction, b: Transaction, key: SortKey, ctx: SortContext): number {
  switch (key) {
    case 'kind':
      // Entrées avant sorties : on lit ce qui rentre, puis ce qui sort.
      return (a.kind === 'income' ? 0 : 1) - (b.kind === 'income' ? 0 : 1);
    case 'name':
      return text(a.name, b.name);
    case 'amount':
      return a.amount - b.amount;
    case 'monthly':
      return monthlyAmount(a) - monthlyAmount(b);
    case 'frequency':
      return (a.frequency === 'monthly' ? 0 : 1) - (b.frequency === 'monthly' ? 0 : 1);
    case 'category': {
      const [ar, ac] = categoryRank(a, ctx.categories);
      const [br, bc] = categoryRank(b, ctx.categories);
      return ar !== br ? ar - br : ac - bc;
    }
    case 'member': {
      // Commun d'abord, puis les membres dans l'ordre des paramètres.
      const rank = (id: string | null) =>
        id === null ? -1 : (ctx.members.find((m) => m.id === id)?.position ?? Infinity);
      return rank(a.member_id) - rank(b.member_id);
    }
    case 'account':
      return text(a.account ?? '', b.account ?? '');
    case 'default':
      return compare(a, b, 'category', ctx) || compare(a, b, 'monthly', ctx);
    case 'position':
      return a.position - b.position;
  }
}

export function sortTransactions(
  transactions: Transaction[],
  sort: Sort,
  ctx: SortContext
): Transaction[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...transactions].sort((a, b) => {
    if (sort.key !== 'position') {
      const [ea, eb] = [isEmpty(a, sort.key), isEmpty(b, sort.key)];
      if (ea !== eb) return ea ? 1 : -1;
    }
    const d = compare(a, b, sort.key, ctx);
    // Départage stable : deux lignes équivalentes gardent leur ordre manuel.
    return d !== 0 ? d * dir : a.position - b.position;
  });
}

/** Filtrage puis tri — l'unique chemin par lequel la grille obtient ses lignes. */
export function viewTransactions(
  transactions: Transaction[],
  filters: TxFilters,
  sort: Sort,
  ctx: SortContext
): Transaction[] {
  return sortTransactions(
    transactions.filter((tx) => matches(tx, filters, ctx.categories)),
    sort,
    ctx
  );
}

/** Comptes saisis dans la grille, dédoublonnés — la liste du filtre « Compte ». */
export function accountsOf(transactions: Transaction[]): string[] {
  const seen = new Set<string>();
  for (const tx of transactions) {
    const value = (tx.account ?? '').trim();
    if (value !== '') seen.add(value);
  }
  return [...seen].sort((a, b) => text(a, b));
}

/**
 * Un groupe de la grille : une catégorie racine et les lignes qui en dépendent,
 * sous-catégories comprises. C'est la racine qui groupe, jamais la
 * sous-catégorie — sinon une même famille se retrouverait éclatée en autant de
 * blocs qu'elle a d'enfants.
 */
export interface CategoryGroup {
  /** null = les lignes non classées, toujours en dernier. */
  root: BudgetCategory | null;
  /** Clé de boucle et de repli ; `''` pour le groupe « Non classé ». */
  key: string;
  transactions: Transaction[];
  income: number;
  expense: number;
}

/** Racine dont dépend une ligne : elle-même si la catégorie est déjà une racine. */
export function rootOf(
  categoryId: string | null,
  categories: BudgetCategory[]
): BudgetCategory | null {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;
  if (category.parent_id === null) return category;
  return categories.find((c) => c.id === category.parent_id) ?? null;
}

/**
 * Regroupe les lignes par racine, dans l'ordre des catégories, non classé en
 * dernier. L'ordre *à l'intérieur* d'un groupe est celui reçu : le tri reste
 * donc actif sous le groupement, au lieu d'être écrasé par lui.
 */
export function groupByCategory(
  transactions: Transaction[],
  categories: BudgetCategory[]
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const tx of transactions) {
    const root = rootOf(tx.category_id, categories);
    const key = root?.id ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { root, key, transactions: [], income: 0, expense: 0 };
      groups.set(key, group);
    }
    group.transactions.push(tx);
    if (tx.kind === 'income') group.income += monthlyAmount(tx);
    else group.expense += monthlyAmount(tx);
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.root) return 1;
    if (!b.root) return -1;
    return a.root.position - b.root.position;
  });
}

/**
 * Un bloc à l'intérieur d'un groupe : une sous-catégorie et ses lignes, ou les
 * lignes posées directement sur la racine.
 */
export interface SubGroup {
  /** null = lignes rattachées à la racine seule, sans sous-catégorie. */
  category: BudgetCategory | null;
  /** `''` pour le bloc sans sous-catégorie. */
  key: string;
  transactions: Transaction[];
  income: number;
  expense: number;
}

/**
 * Découpe un groupe par sous-catégorie, dans l'ordre des catégories, les lignes
 * posées sur la racine en dernier — le même ordre que le diagramme de flux, pour
 * qu'un lecteur retrouve la même séquence d'un support à l'autre.
 */
export function splitBySubcategory(
  group: CategoryGroup,
  categories: BudgetCategory[]
): SubGroup[] {
  const children = group.root
    ? categories.filter((c) => c.parent_id === group.root!.id)
    : [];

  const blocks: SubGroup[] = [];
  const totals = (transactions: Transaction[]) => ({
    income: transactions
      .filter((t) => t.kind === 'income')
      .reduce((a, t) => a + monthlyAmount(t), 0),
    expense: transactions
      .filter((t) => t.kind === 'expense')
      .reduce((a, t) => a + monthlyAmount(t), 0)
  });

  for (const child of children) {
    const transactions = group.transactions.filter((t) => t.category_id === child.id);
    if (transactions.length === 0) continue;
    blocks.push({ category: child, key: child.id, transactions, ...totals(transactions) });
  }

  const direct = group.transactions.filter(
    (t) => t.category_id === (group.root?.id ?? null)
  );
  if (direct.length > 0) {
    blocks.push({ category: null, key: '', transactions: direct, ...totals(direct) });
  }

  return blocks;
}
