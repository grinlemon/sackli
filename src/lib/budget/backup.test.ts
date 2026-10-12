import { describe, expect, it } from 'vitest';
import type { BudgetCategory, BudgetMember, Transaction } from '$lib/types';
import { backupFilename, parseBackup, toBackup, type BudgetBackup } from './backup';

const member = (id: string, user_id: string | null, position: number): BudgetMember => ({
  id, budget_id: 'b', user_id, invite_email: user_id ? null : `${id}@exemple.ch`,
  display_name: id.toUpperCase(), position
});
const category = (id: string, parent_id: string | null, name: string): BudgetCategory => ({
  id, budget_id: 'b', parent_id, name, color: parent_id ? null : '#2f9e6b', position: 0
});
const tx = (patch: Partial<Transaction>): Transaction => ({
  id: 't', budget_id: 'b', name: 'Loyer', kind: 'expense', amount: 1800, category_id: null,
  frequency: 'monthly', member_id: null, account: null, position: 0, splits: [], ...patch
});

const source = {
  budget: { id: 'b', owner_id: 'u1', name: 'Budget familial', created_at: '' },
  members: [member('alice', 'u1', 1), member('bob', 'u2', 2)],
  categories: [category('logement', null, 'Logement'), category('loyer', 'logement', 'Loyer')],
  transactions: [
    tx({
      category_id: 'loyer',
      splits: [
        { transaction_id: 't', member_id: 'alice', weight: 6000 },
        { transaction_id: 't', member_id: 'bob', weight: 4000 }
      ]
    }),
    tx({ name: 'Abo', category_id: 'logement', member_id: 'bob', frequency: 'yearly', position: 1 })
  ]
};

const exported = (): BudgetBackup => toBackup(source, 'u1', new Date('2026-10-05T12:00:00Z'));

describe('toBackup', () => {
  it("ne laisse sortir aucun identifiant de la base", () => {
    const json = JSON.stringify(exported());
    for (const id of ['alice', 'bob', 'logement', 'loyer', 'u1', 'u2']) {
      expect(json).not.toContain(`"${id}"`);
    }
  });

  it('remplace les identifiants par des références internes au fichier', () => {
    const b = exported();
    expect(b.categories.map((c) => [c.ref, c.parent])).toEqual([['c1', null], ['c2', 'c1']]);
    expect(b.transactions[0].category).toBe('c2');
    expect(b.transactions[0].splits).toEqual([{ member: 'm1', weight: 6000 }, { member: 'm2', weight: 4000 }]);
    expect(b.transactions[1].member).toBe('m2');
  });

  it("marque le membre de qui exporte, et lui seul", () => {
    expect(exported().members.map((m) => m.me)).toEqual([true, false]);
  });

  it('garde les emails : c\'est par eux que les autres membres retrouveront le budget', () => {
    expect(exported().members[1].invite_email).toBeNull();
    const b = toBackup({ ...source, members: [member('alice', 'u1', 1), member('carol', null, 2)] }, 'u1', new Date());
    expect(b.members[1].invite_email).toBe('carol@exemple.ch');
  });
});

describe('parseBackup', () => {
  it("relit ce que l'export produit, à l'identique", () => {
    const b = exported();
    expect(parseBackup(JSON.parse(JSON.stringify(b)))).toEqual({ ok: true, backup: b });
  });

  it("refuse ce qui n'est pas un export säckli", () => {
    expect(parseBackup({ hello: 'world' })).toMatchObject({ ok: false });
    expect(parseBackup(null)).toMatchObject({ ok: false });
    expect(parseBackup({ ...exported(), version: 2 })).toEqual({
      ok: false,
      error: "Ce fichier vient d'une version plus récente de säckli."
    });
  });

  it('nomme la ligne fautive', () => {
    const b = exported();
    b.transactions[1].category = 'c9';
    expect(parseBackup(b)).toEqual({ ok: false, error: 'Ligne 2 : catégorie « c9 » introuvable.' });
  });

  it('refuse une répartition vers un membre absent du fichier', () => {
    const b = exported();
    b.transactions[0].splits[0].member = 'm7';
    expect(parseBackup(b)).toMatchObject({ ok: false });
  });

  it('applique les règles du schéma aux catégories', () => {
    const third = exported();
    third.categories.push({ ref: 'c3', parent: 'c2', name: 'Cave', color: null, position: 0 });
    expect(parseBackup(third)).toMatchObject({ ok: false, error: expect.stringContaining('sous-catégorie') });

    const colored = exported();
    colored.categories[1].color = '#000000';
    expect(parseBackup(colored)).toMatchObject({ ok: false, error: expect.stringContaining('couleur') });

    const twin = exported();
    twin.categories.push({ ref: 'c3', parent: null, name: 'LOGEMENT', color: '#000000', position: 1 });
    expect(parseBackup(twin)).toMatchObject({ ok: false, error: expect.stringContaining('deux fois') });
  });

  it('accepte deux sous-catégories homonymes sous des racines différentes', () => {
    const b = exported();
    b.categories.push(
      { ref: 'c3', parent: null, name: 'Santé', color: '#3f7fa1', position: 1 },
      { ref: 'c4', parent: 'c3', name: 'Loyer', color: null, position: 0 }
    );
    expect(parseBackup(b)).toMatchObject({ ok: true });
  });

  it('borne les poids au smallint de transaction_splits', () => {
    const b = exported();
    b.transactions[0].splits[0].weight = 40000;
    expect(parseBackup(b)).toMatchObject({ ok: false });
  });

  it("n'accepte qu'un seul membre marqué comme soi", () => {
    const b = exported();
    b.members[1].me = true;
    expect(parseBackup(b)).toMatchObject({ ok: false });
  });

  it('écarte les champs inconnus plutôt que de les envoyer à la base', () => {
    const b = { ...exported(), budget: { name: 'X', owner_id: 'pirate' } } as unknown;
    const parsed = parseBackup(b);
    expect(parsed.ok && parsed.backup.budget).toEqual({ name: 'X' });
  });
});

describe('backupFilename', () => {
  it('retire accents et espaces', () => {
    expect(backupFilename('Budget säckli 2026', new Date('2026-10-05T12:00:00Z')))
      .toBe('saeckli-budget-sackli-2026-2026-10-05.json');
    expect(backupFilename('!!!', new Date('2026-10-05T12:00:00Z'))).toBe('saeckli-budget-2026-10-05.json');
  });
});

describe('toBackup — ordre', () => {
  it("ne dépend pas de l'ordre rendu par la base", () => {
    const shuffled = {
      ...source,
      members: [...source.members].reverse(),
      categories: [category('loyer', 'logement', 'Loyer'), category('sante', null, 'Santé'), category('logement', null, 'Logement')],
      transactions: [...source.transactions].reverse()
    };
    const ordered = { ...source, categories: [...shuffled.categories].reverse() };
    const at = new Date('2026-10-05T12:00:00Z');
    expect(toBackup(shuffled, 'u1', at)).toEqual(toBackup(ordered, 'u1', at));
  });

  it('place chaque sous-catégorie juste après sa racine', () => {
    const b = toBackup(
      { ...source, categories: [category('loyer', 'logement', 'Loyer'), category('sante', null, 'Santé'), category('logement', null, 'Logement')] },
      'u1', new Date()
    );
    expect(b.categories.map((c) => c.name)).toEqual(['Logement', 'Loyer', 'Santé']);
  });
});
