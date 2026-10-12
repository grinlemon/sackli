import type { BudgetCategory, Frequency, TxKind } from '$lib/types';

/**
 * Budget de départ proposé à la création d'un budget : les lignes d'un ménage
 * ordinaire, à zéro. Aucun montant inventé — il n'y a rien à croire, juste une
 * trame à remplir. Le budget réel de dev vit dans supabase/seed.sql.
 *
 * `owner` : 'a' = premier membre, 'b' = second, null = commun.
 */
export interface SeedRow {
  name: string;
  kind: TxKind;
  amount: number;
  /** Nom de la catégorie racine, tel que la migration la sème. */
  category: string;
  /** Sous-catégorie, ou null pour poser la ligne sur la racine. */
  sub: string | null;
  frequency: Frequency;
  owner: 'a' | 'b' | null;
  account: string;
}

const r = (
  name: string, kind: TxKind, category: string, sub: string | null,
  frequency: Frequency, owner: 'a' | 'b' | null
): SeedRow => ({ name, kind, amount: 0, category, sub, frequency, owner, account: '' });

export const STARTER_ROWS: SeedRow[] = [
  r('Salaire', 'income', 'Revenu', 'Salaire', 'monthly', 'a'),
  r('Salaire', 'income', 'Revenu', 'Salaire', 'monthly', 'b'),
  r('Loyer', 'expense', 'Logement', 'Loyer', 'monthly', null),
  r('Électricité', 'expense', 'Logement', 'Énergie', 'monthly', null),
  r('Assurance maladie', 'expense', 'Santé', 'Assurance maladie', 'monthly', 'a'),
  r('Assurance maladie', 'expense', 'Santé', 'Assurance maladie', 'monthly', 'b'),
  r('Impôts', 'expense', 'Impôts & taxes', 'Impôts', 'yearly', null),
  r('Courses', 'expense', 'Alimentation', 'Courses', 'monthly', null),
  r('Téléphone', 'expense', 'Abonnements', 'Télécom', 'monthly', 'a'),
  r('Internet', 'expense', 'Abonnements', 'Télécom', 'monthly', null),
  r('Transports', 'expense', 'Transport', 'Transports publics & parking', 'monthly', null),
  r('Loisirs', 'expense', 'Loisirs', 'Sorties & culture', 'monthly', null),
  r('Épargne', 'expense', 'Épargne & réserves', 'Épargne & placements', 'monthly', null)
];

/**
 * Traduit le couple (racine, sous-catégorie) d'une ligne de trame en
 * identifiant. On retombe sur la racine si la sous-catégorie manque, et sur
 * `null` si la racine elle-même est absente : une trame qui ne reconnaît plus
 * une catégorie produit des lignes non classées, jamais mal classées.
 */
export function seedCategoryId(
  row: SeedRow,
  categories: Pick<BudgetCategory, 'id' | 'parent_id' | 'name'>[]
): string | null {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const root = categories.find((c) => c.parent_id === null && same(c.name, row.category));
  if (!root) return null;
  if (!row.sub) return root.id;
  const child = categories.find((c) => c.parent_id === root.id && same(c.name, row.sub!));
  return child?.id ?? root.id;
}
