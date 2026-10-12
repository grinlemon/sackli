import { describe, expect, it } from 'vitest';
import type { BudgetCategory, Transaction } from '$lib/types';
import { buildSankey, ellipsize, fitScale, layoutSankey, onPath, upstream, type SankeyGraph } from './sankey';
import { PAGE_HEIGHT, PAGE_WIDTH, PRINT_SANKEY, SANKEY_ROOM } from './print';

function cat(p: Partial<BudgetCategory>): BudgetCategory {
  return { id: 'c', budget_id: 'b', parent_id: null, name: '', color: '#2f9e6b', position: 0, ...p };
}

const maison = cat({ id: 'maison', name: 'Maison', position: 0 });
const loyer = cat({ id: 'loyer', parent_id: 'maison', name: 'Loyer', color: null, position: 0 });
const loisir = cat({ id: 'loisir', name: 'Loisir', position: 1 });
const categories = [maison, loyer, loisir];

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 't', budget_id: 'b', name: '', kind: 'expense', amount: 0, category_id: null,
    frequency: 'monthly', member_id: null, account: null, position: 0, splits: [], ...p
  };
}

const budget = [
  tx({ id: 'salaire', name: 'Salaire', kind: 'income', amount: 5000, category_id: null }),
  tx({ id: 'rent', name: 'Loyer', amount: 1620, category_id: 'loyer' }),
  tx({ id: 'elec', name: 'Electricité', amount: 40, category_id: 'loyer' }),
  tx({ id: 'lessive', name: 'Lessive', amount: 40, category_id: 'maison' }),
  tx({ id: 'netflix', name: 'Netflix', amount: 15, category_id: 'loisir' }),
  tx({ id: 'impots', name: 'Impôts', amount: 1200, frequency: 'yearly', category_id: null })
];

const byId = (g: SankeyGraph, id: string) => g.nodes.find((n) => n.id === id);
const total = 1620 + 40 + 40 + 15 + 100;

describe('buildSankey', () => {
  it('part des revenus et rend le solde comme une branche', () => {
    const g = buildSankey(budget, categories);
    expect(byId(g, 'income')?.value).toBe(5000);
    expect(byId(g, 'rest')?.value).toBe(5000 - total);
    expect(byId(g, 'rest')?.depth).toBe(1);
  });

  it('mensualise avant de donner son épaisseur à un ruban', () => {
    // 1200/an = 100/mois : la ligne ne doit pas peser 1200 dans le diagramme.
    const g = buildSankey(budget, categories);
    expect(byId(g, 'tx:impots')?.value).toBe(100);
    expect(byId(g, 'root:')?.value).toBe(100);
  });

  it('range une sous-catégorie entre sa racine et ses lignes', () => {
    const g = buildSankey(budget, categories);
    expect(byId(g, 'root:maison')?.value).toBe(1700);
    expect(byId(g, 'cat:loyer')?.value).toBe(1660);
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'root:maison', target: 'cat:loyer', value: 1660 }));
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'cat:loyer', target: 'tx:rent' }));
  });

  it('garde toutes les lignes dans la dernière colonne, classées finement ou non', () => {
    const g = buildSankey(budget, categories);
    const leaves = g.nodes.filter((n) => n.kind === 'leaf');
    expect(leaves).toHaveLength(5);
    expect(new Set(leaves.map((n) => n.depth))).toEqual(new Set([3]));
    // « Lessive » est posée sur la racine : son ruban part donc de la racine.
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'root:maison', target: 'tx:lessive' }));
  });

  it('conserve les montants : ce qui sort d\'un nœud vaut ce qui y entre', () => {
    const g = buildSankey(budget, categories);
    for (const node of g.nodes) {
      const out = g.links.filter((l) => l.source === node.id).reduce((a, l) => a + l.value, 0);
      if (out > 0) expect(out).toBeCloseTo(node.value, 6);
    }
    const fromIncome = g.links.filter((l) => l.source === 'income').reduce((a, l) => a + l.value, 0);
    expect(fromIncome).toBeCloseTo(5000, 6);
  });

  it('compacte la colonne des sous-catégories quand il n\'y en a aucune', () => {
    const flat = budget.map((t) => ({ ...t, category_id: t.category_id === 'loyer' ? 'maison' : t.category_id }));
    expect(buildSankey(flat, categories).columns).toBe(3);
    expect(buildSankey(budget, categories).columns).toBe(4);
    expect(buildSankey(budget, categories, 'roots').columns).toBe(2);
  });

  it('s\'arrête au niveau demandé', () => {
    expect(buildSankey(budget, categories, 'roots').nodes.some((n) => n.kind === 'leaf')).toBe(false);
    expect(buildSankey(budget, categories, 'children').nodes.some((n) => n.kind === 'leaf')).toBe(false);
    expect(buildSankey(budget, categories, 'children').nodes.some((n) => n.kind === 'child')).toBe(true);
  });

  it('ignore les lignes à zéro et n\'invente pas de reste en déficit', () => {
    const g = buildSankey([...budget, tx({ id: 'vide', name: 'Vide', amount: 0 })], categories);
    expect(byId(g, 'tx:vide')).toBeUndefined();

    const deficit = buildSankey(
      [tx({ kind: 'income', amount: 100 }), tx({ id: 'gros', amount: 900, category_id: 'loisir' })],
      categories
    );
    expect(byId(deficit, 'rest')).toBeUndefined();
  });

  it('rend un graphe vide plutôt que des nœuds à zéro', () => {
    expect(buildSankey([], categories)).toEqual({ nodes: [], links: [], columns: 0, total: 0 });
  });
});

describe('layoutSankey', () => {
  const laid = layoutSankey(buildSankey(budget, categories), { width: 900 });

  it('produit des coordonnées finies et des colonnes ordonnées de gauche à droite', () => {
    expect(laid.nodes.length).toBeGreaterThan(0);
    for (const n of laid.nodes) {
      for (const v of [n.x0, n.x1, n.y0, n.y1]) expect(Number.isFinite(v)).toBe(true);
      expect(n.y1).toBeGreaterThan(n.y0);
      expect(n.x1).toBeGreaterThan(n.x0);
    }
    const income = laid.nodes.find((n) => n.id === 'income')!;
    const leaf = laid.nodes.find((n) => n.kind === 'leaf')!;
    expect(income.x0).toBeLessThan(leaf.x0);
  });

  it('tient dans la largeur, étiquettes comprises', () => {
    for (const n of laid.nodes) {
      expect(n.x1).toBeLessThanOrEqual(900 - 160 + 0.01);
      expect(n.labelRoom).toBeGreaterThan(0);
    }
  });

  it('n\'empile jamais deux nœuds l\'un sur l\'autre dans une colonne', () => {
    const columns = new Map<number, typeof laid.nodes>();
    for (const n of laid.nodes) columns.set(n.depth, [...(columns.get(n.depth) ?? []), n]);
    for (const col of columns.values()) {
      const sorted = [...col].sort((a, b) => a.y0 - b.y0);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].y0).toBeGreaterThanOrEqual(sorted[i - 1].y1);
      }
    }
  });

  it('attache les rubans dans les bornes du nœud qu\'ils quittent', () => {
    const income = laid.nodes.find((n) => n.id === 'income')!;
    const out = laid.links.filter((l) => l.source === 'income');
    const sum = out.reduce((a, l) => a + l.width, 0);
    expect(sum).toBeLessThanOrEqual(income.y1 - income.y0 + 0.5);
    for (const link of out) expect(link.path.startsWith('M')).toBe(true);
  });

  it('garde une échelle commune : même montant, même épaisseur', () => {
    const rent = laid.links.find((l) => l.target === 'tx:rent')!;
    const impots = laid.links.find((l) => l.target === 'tx:impots')!;
    expect(rent.width / impots.width).toBeCloseTo(1620 / 100, 1);
  });

  it('laisse un trait visible aux tout petits montants', () => {
    // 15.–/mois face à 5000 de revenus ne ferait même pas un pixel à l'échelle.
    const netflix = laid.links.find((l) => l.target === 'tx:netflix')!;
    expect(netflix.width).toBeGreaterThanOrEqual(1);
    expect(laid.nodes.find((n) => n.id === 'tx:netflix')!.y1 - laid.nodes.find((n) => n.id === 'tx:netflix')!.y0)
      .toBeGreaterThanOrEqual(2);
  });

  it('ne dessine rien pour un graphe vide', () => {
    const empty = layoutSankey({ nodes: [], links: [], columns: 0, total: 0 }, { width: 900 });
    expect(empty).toEqual({ nodes: [], links: [], width: 900, height: 0 });
  });
});

describe('ellipsize', () => {
  it('coupe au plus près de la place disponible', () => {
    expect(ellipsize('Loyer', 200)).toBe('Loyer');
    expect(ellipsize('Assurance maladie Alexandra', 60)).toMatch(/…$/);
    expect(ellipsize('Assurance maladie Alexandra', 60).length).toBeLessThanOrEqual(11);
    expect(ellipsize('Loyer', 3)).toBe('');
  });
});

describe('tenue en page (export PDF)', () => {
  /** Un budget de `count` lignes réparties sur les dix racines par défaut. */
  function budget(count: number) {
    const roots: BudgetCategory[] = Array.from({ length: 10 }, (_, i) =>
      cat({ id: `r${i}`, name: `Racine ${i}`, position: i })
    );
    const children: BudgetCategory[] = roots.flatMap((root, i) => [
      cat({ id: `${root.id}a`, parent_id: root.id, name: `Fille ${i}a`, color: null, position: 0 }),
      cat({ id: `${root.id}b`, parent_id: root.id, name: `Fille ${i}b`, color: null, position: 1 })
    ]);
    const lines = Array.from({ length: count }, (_, i) =>
      tx({
        id: `t${i}`,
        name: `Ligne ${i}`,
        // Amplitude large : c'est elle qui écrase les petites lignes.
        amount: i % 7 === 0 ? 1500 : 5 + (i % 90),
        category_id: children[i % children.length].id,
        position: i
      })
    );
    return {
      categories: [...roots, ...children],
      transactions: [tx({ id: 'in', kind: 'income', amount: 9000, position: -1 }), ...lines]
    };
  }

  it('ne dépasse jamais la hauteur de la page, quel que soit le nombre de lignes', () => {
    for (const count of [5, 36, 60, 150]) {
      const { categories: cats, transactions } = budget(count);
      const layout = layoutSankey(buildSankey(transactions, cats), {
        ...PRINT_SANKEY,
        width: PAGE_WIDTH
      });
      const drawn = layout.height * fitScale(layout.height, SANKEY_ROOM);
      expect(drawn).toBeLessThanOrEqual(SANKEY_ROOM + 0.01);
      for (const node of layout.nodes) expect(node.x1).toBeLessThanOrEqual(PAGE_WIDTH);
    }
  });

  it('ne touche pas à un diagramme qui tient déjà', () => {
    const { categories: cats, transactions } = budget(12);
    const layout = layoutSankey(buildSankey(transactions, cats), {
      ...PRINT_SANKEY,
      width: PAGE_WIDTH
    });
    expect(layout.height).toBeLessThanOrEqual(SANKEY_ROOM);
    expect(fitScale(layout.height, SANKEY_ROOM)).toBe(1);
  });

  it('réduit exactement ce qu\'il faut quand le budget déborde', () => {
    const { categories: cats, transactions } = budget(150);
    const layout = layoutSankey(buildSankey(transactions, cats), {
      ...PRINT_SANKEY,
      width: PAGE_WIDTH
    });
    const scale = fitScale(layout.height, SANKEY_ROOM);
    expect(scale).toBeLessThan(1);
    expect(layout.height * scale).toBeCloseTo(SANKEY_ROOM, 6);
  });

  it('la page reste celle qu\'annonce la règle @page : A4 paysage moins ses marges', () => {
    expect([PAGE_WIDTH, PAGE_HEIGHT]).toEqual([1032, 703]);
  });
});

describe('référence des pourcentages', () => {
  it('rapporte au revenu, la source du flux', () => {
    expect(buildSankey(budget, categories).total).toBe(5000);
  });

  it('retombe sur les dépenses quand il n\'y a pas de revenu', () => {
    const sansRevenu = budget.filter((t) => t.kind === 'expense');
    const g = buildSankey(sansRevenu, categories);
    expect(g.total).toBe(total);
    expect(byId(g, 'rest')).toBeUndefined();
  });
});

describe('upstream', () => {
  const graph = buildSankey(budget, categories, 'lines');

  it("remonte d'une ligne jusqu'aux revenus, en passant par sa sous-catégorie et sa racine", () => {
    expect([...upstream(graph, 'tx:rent')].sort()).toEqual(['cat:loyer', 'income', 'root:maison', 'tx:rent'].sort());
  });

  it("ne prend ni les sœurs ni les enfants du nœud choisi", () => {
    const path = upstream(graph, 'cat:loyer');
    expect(path.has('tx:rent')).toBe(false);
    expect(path.has('tx:lessive')).toBe(false);
    expect(path.has('root:maison')).toBe(true);
  });

  it('suit une ligne posée directement sur sa racine', () => {
    expect([...upstream(graph, 'tx:lessive')].sort()).toEqual(['income', 'root:maison', 'tx:lessive'].sort());
  });

  it('rend un chemin vide pour une sélection absente du graphe', () => {
    expect(upstream(buildSankey(budget, categories, 'roots'), 'tx:rent').size).toBe(0);
    expect(upstream(graph, null).size).toBe(0);
  });

  it('ne garde que les rubans du chemin', () => {
    const path = upstream(graph, 'tx:rent');
    const kept = graph.links.filter((l) => onPath(path, l)).map((l) => `${l.source}>${l.target}`);
    expect(kept.sort()).toEqual(['cat:loyer>tx:rent', 'income>root:maison', 'root:maison>cat:loyer'].sort());
  });
});
