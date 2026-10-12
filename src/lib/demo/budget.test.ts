import { describe, expect, it } from 'vitest';
import { memberBreakdown, splitPreset } from '$lib/budget/calc';
import { DEFAULT_TAXONOMY, DEMO_CATEGORIES, DEMO_MEMBERS, demoTransactions } from './budget';
// `?raw` plutôt que `node:fs` : le projet n'embarque pas les types de Node.
import sql from '../../../supabase/migrations/20260921161500_categories_taxonomy.sql?raw';

describe('budget de démo', () => {
  it('reprend le jeu de catégories de la migration, dans le même ordre', () => {
    // Le bloc des sous-catégories : ('Racine', 'Enfant', position). Celui des
    // racines a la même forme, une couleur à la place de l'enfant : on l'écarte.
    const rows = [...sql.matchAll(/\('([^']+)',\s+'([^']+)',\s+(\d+)\)/g)]
      .map(([, root, child]) => [root, child])
      .filter(([, child]) => !child.startsWith('#'));
    const expected = new Map<string, string[]>();
    for (const [root, child] of rows) expected.set(root, [...(expected.get(root) ?? []), child]);
    expect(DEFAULT_TAXONOMY).toEqual([...expected.entries()]);
  });

  it('ne range aucune ligne dans une catégorie inexistante', () => {
    const ids = new Set(DEMO_CATEGORIES.map((c) => c.id));
    for (const tx of demoTransactions()) expect(ids.has(tx.category_id!), tx.name).toBe(true);
  });

  it('écrit des poids qui tiennent dans un smallint', () => {
    for (const tx of demoTransactions())
      for (const s of tx.splits) expect(s.weight).toBeLessThanOrEqual(32767);
  });

  it('montre la répartition selon les revenus, et laisse un reste positif à chacun', () => {
    const rows = demoTransactions();
    expect(splitPreset(rows.find((t) => t.name === 'Loyer')!, rows, DEMO_MEMBERS)).toBe('income');
    for (const m of DEMO_MEMBERS) expect(memberBreakdown(rows, m, DEMO_MEMBERS).remaining).toBeGreaterThan(0);
  });

  it('repart de zéro à chaque appel', () => {
    const a = demoTransactions();
    a[0].amount = 1;
    expect(demoTransactions()[0].amount).not.toBe(1);
  });
});
