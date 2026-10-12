import { describe, expect, it } from 'vitest';
import type { BudgetCategory, BudgetMember, Transaction } from '$lib/types';
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  accountsOf,
  groupByCategory,
  isFiltering,
  matches,
  rootOf,
  sortTransactions,
  viewTransactions,
  type TxFilters
} from './filters';

const g: BudgetMember = {
  id: 'g', budget_id: 'b', user_id: 'u1', invite_email: null, display_name: 'Alex', position: 1
};
const i: BudgetMember = {
  id: 'i', budget_id: 'b', user_id: null, invite_email: null, display_name: 'Sam', position: 2
};
const members = [g, i];

function cat(p: Partial<BudgetCategory>): BudgetCategory {
  return { id: 'c', budget_id: 'b', parent_id: null, name: '', color: '#2f9e6b', position: 0, ...p };
}

// Une racine « Maison » avec deux enfants, et une racine « Loisir » seule.
const maison = cat({ id: 'maison', name: 'Maison', position: 0 });
const loyer = cat({ id: 'loyer', parent_id: 'maison', name: 'Loyer', color: null, position: 0 });
const energie = cat({ id: 'energie', parent_id: 'maison', name: 'Électricité', color: null, position: 1 });
const loisir = cat({ id: 'loisir', name: 'Loisir', position: 1 });
const categories = [maison, loyer, energie, loisir];

const ctx = { members, categories };

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 't', budget_id: 'b', name: '', kind: 'expense', amount: 0, category_id: null,
    frequency: 'monthly', member_id: null, account: null, position: 0, splits: [], ...p
  };
}

function filters(p: Partial<TxFilters> = {}): TxFilters {
  return { ...EMPTY_FILTERS, ...p };
}

describe('matches', () => {
  it('laisse tout passer sans filtre', () => {
    expect(matches(tx({ name: 'Loyer' }), EMPTY_FILTERS, categories)).toBe(true);
    expect(isFiltering(EMPTY_FILTERS)).toBe(false);
  });

  it('ignore les accents et la casse dans la recherche', () => {
    const t = tx({ name: 'Électricité' });
    expect(matches(t, filters({ search: 'electr' }), categories)).toBe(true);
    expect(matches(t, filters({ search: 'ÉLECTR' }), categories)).toBe(true);
    expect(matches(t, filters({ search: 'gaz' }), categories)).toBe(false);
  });

  it('cherche aussi dans le compte et le nom de catégorie', () => {
    const t = tx({ name: 'Netflix', account: 'Yuh', category_id: 'loisir' });
    expect(matches(t, filters({ search: 'yuh' }), categories)).toBe(true);
    expect(matches(t, filters({ search: 'loisir' }), categories)).toBe(true);
  });

  it('une racine choisie embarque ses sous-catégories', () => {
    expect(matches(tx({ category_id: 'loyer' }), filters({ categoryId: 'maison' }), categories)).toBe(true);
    expect(matches(tx({ category_id: 'maison' }), filters({ categoryId: 'maison' }), categories)).toBe(true);
    expect(matches(tx({ category_id: 'loisir' }), filters({ categoryId: 'maison' }), categories)).toBe(false);
  });

  it('une sous-catégorie choisie ne remonte pas vers sa racine', () => {
    expect(matches(tx({ category_id: 'maison' }), filters({ categoryId: 'loyer' }), categories)).toBe(false);
    expect(matches(tx({ category_id: 'loyer' }), filters({ categoryId: 'loyer' }), categories)).toBe(true);
  });

  it('isole les lignes non classées et les lignes sans compte', () => {
    expect(matches(tx({ category_id: null }), filters({ categoryId: 'none' }), categories)).toBe(true);
    expect(matches(tx({ category_id: 'loisir' }), filters({ categoryId: 'none' }), categories)).toBe(false);
    expect(matches(tx({ account: null }), filters({ account: 'none' }), categories)).toBe(true);
    expect(matches(tx({ account: 'Yuh' }), filters({ account: 'none' }), categories)).toBe(false);
  });

  it('sépare commun et rattaché', () => {
    expect(matches(tx({ member_id: null }), filters({ memberId: 'common' }), categories)).toBe(true);
    expect(matches(tx({ member_id: 'g' }), filters({ memberId: 'common' }), categories)).toBe(false);
    expect(matches(tx({ member_id: 'g' }), filters({ memberId: 'g' }), categories)).toBe(true);
  });

  it('borne sur le montant mensualisé, pas sur le montant saisi', () => {
    // 1200/an = 100/mois : la ligne sort d'un filtre « au moins 200 ».
    const annuel = tx({ amount: 1200, frequency: 'yearly' });
    expect(matches(annuel, filters({ min: 200 }), categories)).toBe(false);
    expect(matches(annuel, filters({ min: 100, max: 100 }), categories)).toBe(true);
  });

  it('combine les critères en ET', () => {
    const t = tx({ name: 'Loyer', kind: 'expense', category_id: 'loyer', member_id: null });
    expect(matches(t, filters({ kind: 'expense', categoryId: 'maison' }), categories)).toBe(true);
    expect(matches(t, filters({ kind: 'income', categoryId: 'maison' }), categories)).toBe(false);
  });
});

describe('sortTransactions', () => {
  it('rend l\'ordre de saisie intact sur la clé position', () => {
    const rows = [tx({ id: 'b', position: 1 }), tx({ id: 'a', position: 0 })];
    expect(sortTransactions(rows, { key: 'position', dir: 'asc' }, ctx).map((t) => t.id))
      .toEqual(['a', 'b']);
  });

  it('trie par défaut par catégorie, puis par montant mensuel croissant', () => {
    const rows = [
      tx({ id: 'sans', category_id: null, amount: 1, position: 0 }),
      tx({ id: 'loyer-cher', category_id: 'loyer', amount: 2000, position: 1 }),
      tx({ id: 'energie', category_id: 'energie', amount: 50, position: 2 }),
      tx({ id: 'loyer-annuel', category_id: 'loyer', amount: 1200, frequency: 'yearly', position: 3 }),
      tx({ id: 'loyer-moyen', category_id: 'loyer', amount: 500, position: 4 }),
      tx({ id: 'loisir', category_id: 'loisir', amount: 10, position: 5 })
    ];
    expect(sortTransactions(rows, DEFAULT_SORT, ctx).map((t) => t.id)).toEqual([
      'loyer-annuel', 'loyer-moyen', 'loyer-cher', 'energie', 'loisir', 'sans'
    ]);
  });

  it('ne mute pas le tableau reçu', () => {
    const rows = [tx({ id: 'b', amount: 2, position: 0 }), tx({ id: 'a', amount: 1, position: 1 })];
    sortTransactions(rows, { key: 'amount', dir: 'asc' }, ctx);
    expect(rows.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('trie sur le montant mensualisé, pas sur le montant brut', () => {
    const rows = [
      tx({ id: 'annuel', amount: 1200, frequency: 'yearly', position: 0 }),
      tx({ id: 'mensuel', amount: 500, frequency: 'monthly', position: 1 })
    ];
    expect(sortTransactions(rows, { key: 'monthly', dir: 'asc' }, ctx).map((t) => t.id))
      .toEqual(['annuel', 'mensuel']);
    expect(sortTransactions(rows, { key: 'amount', dir: 'asc' }, ctx).map((t) => t.id))
      .toEqual(['mensuel', 'annuel']);
  });

  it('garde les vides en bas dans les deux sens', () => {
    const rows = [
      tx({ id: 'vide', account: null, position: 0 }),
      tx({ id: 'yuh', account: 'Yuh', position: 1 }),
      tx({ id: 'raif', account: 'Raiffeisen', position: 2 })
    ];
    expect(sortTransactions(rows, { key: 'account', dir: 'asc' }, ctx).map((t) => t.id))
      .toEqual(['raif', 'yuh', 'vide']);
    expect(sortTransactions(rows, { key: 'account', dir: 'desc' }, ctx).map((t) => t.id))
      .toEqual(['yuh', 'raif', 'vide']);
  });

  it('regroupe les sous-catégories sous leur racine, non classé en dernier', () => {
    const rows = [
      tx({ id: 'sans', category_id: null, position: 0 }),
      tx({ id: 'loisir', category_id: 'loisir', position: 1 }),
      tx({ id: 'energie', category_id: 'energie', position: 2 }),
      tx({ id: 'maison', category_id: 'maison', position: 3 }),
      tx({ id: 'loyer', category_id: 'loyer', position: 4 })
    ];
    expect(sortTransactions(rows, { key: 'category', dir: 'asc' }, ctx).map((t) => t.id))
      .toEqual(['maison', 'loyer', 'energie', 'loisir', 'sans']);
  });

  it('classe commun avant les membres, dans l\'ordre des paramètres', () => {
    const rows = [
      tx({ id: 'sam', member_id: 'i', position: 0 }),
      tx({ id: 'alex', member_id: 'g', position: 1 }),
      tx({ id: 'commun', member_id: null, position: 2 })
    ];
    expect(sortTransactions(rows, { key: 'member', dir: 'asc' }, ctx).map((t) => t.id))
      .toEqual(['commun', 'alex', 'sam']);
  });

  it('départage deux lignes égales par leur position', () => {
    const rows = [
      tx({ id: 'c', amount: 10, position: 2 }),
      tx({ id: 'a', amount: 10, position: 0 }),
      tx({ id: 'b', amount: 10, position: 1 })
    ];
    expect(sortTransactions(rows, { key: 'amount', dir: 'desc' }, ctx).map((t) => t.id))
      .toEqual(['a', 'b', 'c']);
  });
});

describe('viewTransactions', () => {
  it('filtre puis trie', () => {
    const rows = [
      tx({ id: 'salaire', kind: 'income', amount: 5000, position: 0 }),
      tx({ id: 'loyer', kind: 'expense', amount: 1620, position: 1 }),
      tx({ id: 'impots', kind: 'expense', amount: 12000, frequency: 'yearly', position: 2 })
    ];
    const view = viewTransactions(rows, filters({ kind: 'expense' }), { key: 'monthly', dir: 'desc' }, ctx);
    expect(view.map((t) => t.id)).toEqual(['loyer', 'impots']);
  });
});

describe('accountsOf', () => {
  it('dédoublonne, ignore les vides et trie', () => {
    const rows = [
      tx({ account: 'Yuh' }), tx({ account: 'Raiffeisen' }), tx({ account: 'Yuh' }),
      tx({ account: '  ' }), tx({ account: null })
    ];
    expect(accountsOf(rows)).toEqual(['Raiffeisen', 'Yuh']);
  });
});

describe('groupByCategory', () => {
  it('range une sous-catégorie sous sa racine, pas dans son propre groupe', () => {
    const rows = [
      tx({ id: 'loyer', category_id: 'loyer' }),
      tx({ id: 'elec', category_id: 'energie' }),
      tx({ id: 'general', category_id: 'maison' })
    ];
    const groups = groupByCategory(rows, categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].root?.id).toBe('maison');
    expect(groups[0].transactions.map((t) => t.id)).toEqual(['loyer', 'elec', 'general']);
  });

  it('suit l\'ordre des catégories et met le non classé en dernier', () => {
    const rows = [
      tx({ id: 'sans', category_id: null }),
      tx({ id: 'loisir', category_id: 'loisir' }),
      tx({ id: 'maison', category_id: 'maison' })
    ];
    expect(groupByCategory(rows, categories).map((g) => g.key)).toEqual(['maison', 'loisir', '']);
  });

  it('préserve le tri reçu à l\'intérieur d\'un groupe', () => {
    const rows = viewTransactions(
      [
        tx({ id: 'petit', category_id: 'maison', amount: 40, position: 0 }),
        tx({ id: 'gros', category_id: 'loyer', amount: 1620, position: 1 })
      ],
      EMPTY_FILTERS,
      { key: 'monthly', dir: 'desc' },
      ctx
    );
    expect(groupByCategory(rows, categories)[0].transactions.map((t) => t.id))
      .toEqual(['gros', 'petit']);
  });

  it('totalise entrées et sorties séparément, au mois', () => {
    const rows = [
      tx({ category_id: 'maison', kind: 'expense', amount: 1200, frequency: 'yearly' }),
      tx({ category_id: 'loyer', kind: 'expense', amount: 500 }),
      tx({ category_id: 'maison', kind: 'income', amount: 300 })
    ];
    const [group] = groupByCategory(rows, categories);
    expect(group.expense).toBe(600);
    expect(group.income).toBe(300);
  });

  it('ne crée pas de groupe vide', () => {
    expect(groupByCategory([], categories)).toEqual([]);
  });

  it('traite une catégorie supprimée comme non classée', () => {
    expect(groupByCategory([tx({ category_id: 'disparue' })], categories)[0].key).toBe('');
  });
});

describe('rootOf', () => {
  it('remonte d\'un enfant à sa racine et laisse une racine en place', () => {
    expect(rootOf('loyer', categories)?.id).toBe('maison');
    expect(rootOf('maison', categories)?.id).toBe('maison');
    expect(rootOf(null, categories)).toBeNull();
  });
});
