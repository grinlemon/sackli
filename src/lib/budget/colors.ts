import type { BudgetCategory } from '$lib/types';

/**
 * Couleurs proposées dans les paramètres. Ce sont des *données* (elles finissent
 * en base, où la contrainte `color ~ '^#rrggbb$'` les valide), pas des tokens de
 * design : l'utilisateur peut en choisir n'importe quelle autre.
 *
 * Le jeu par défaut est dupliqué dans la migration qui sème les catégories —
 * c'est le prix à payer pour qu'un budget soit complet dès son insertion, sans
 * dépendre de l'applicatif.
 */
export const COLOR_PRESETS = [
  // Dans l'ordre des racines du jeu par défaut : Revenu, Logement, Santé,
  // Transport, Alimentation, Abonnements, Loisirs, Impôts & taxes,
  // Épargne & réserves, Divers.
  '#2f9e6b', '#b8763a', '#a1453f', '#2f8fa1', '#6f9e2f',
  '#c2557f', '#8a5fa8', '#1c1f1d', '#3f7fa1', '#6b716e'
] as const;

const FALLBACK = '#b9c6c0';

/** `#rrggbb` → `rgba(r, g, b, alpha)`. */
export function tint(hex: string, alpha: number): string {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : FALLBACK;
  const n = parseInt(value.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Opacité du fond d'une ligne. La racine est la plus discrète ; les
 * sous-catégories montent d'un cran et cyclent, ce qui les sépare entre sœurs
 * sans jamais changer de teinte.
 */
const CHILD_ALPHAS = [0.07, 0.1, 0.13];
const ROOT_ALPHA = 0.045;
/** Un cran au-dessus des lignes : l'en-tête de groupe doit les coiffer, pas se fondre. */
const GROUP_ALPHA = 0.12;

export interface RowAccent {
  /** Couleur pleine du liseré vertical. */
  stripe: string;
  /** Même couleur, très diluée, pour le fond de la ligne. */
  background: string;
}

/**
 * Accentuation d'une ligne à partir de sa catégorie. Une ligne non classée, ou
 * dont la catégorie a été supprimée, ne reçoit aucune couleur — mais le liseré
 * garde sa place pour que les lignes restent alignées.
 */
export function rowAccent(
  categoryId: string | null,
  categories: BudgetCategory[]
): RowAccent | null {
  if (!categoryId) return null;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;

  if (category.parent_id === null) {
    const color = category.color ?? FALLBACK;
    return { stripe: color, background: tint(color, ROOT_ALPHA) };
  }

  const parent = categories.find((c) => c.id === category.parent_id);
  const color = parent?.color ?? FALLBACK;
  const siblings = categories.filter((c) => c.parent_id === category.parent_id);
  const rank = Math.max(0, siblings.indexOf(category));
  return {
    stripe: color,
    background: tint(color, CHILD_ALPHAS[rank % CHILD_ALPHAS.length])
  };
}

/**
 * Accent d'un en-tête de groupe. Même teinte que les lignes qu'il coiffe, fond
 * plus dense — et une couleur neutre pour le groupe « Non classé », qui doit
 * rester un groupe visible plutôt qu'une zone vide.
 */
export function groupAccent(root: BudgetCategory | null): RowAccent {
  const color = root?.color ?? FALLBACK;
  return { stripe: color, background: tint(color, GROUP_ALPHA) };
}

/**
 * Teinte d'un membre, par son rang dans les paramètres : la même dans la vue
 * Analyse et dans l'éditeur de répartition, pour qu'une couleur désigne
 * toujours la même personne d'un écran à l'autre.
 */
export const MEMBER_COLORS = [
  'var(--color-member-a)',
  'var(--color-member-b)',
  '#6f8f83',
  '#c3d6cd'
];
/** Les teintes assez sombres pour porter du texte clair. */
export const MEMBER_DARK = [true, false, true, false];

export function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}
