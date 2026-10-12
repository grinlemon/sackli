/**
 * Géométrie du document exporté : A4 paysage, marges de 12mm, à 96dpi —
 * 297−24 = 273mm de large, 210−24 = 186mm de haut.
 *
 * Ces valeurs sont partagées par la route d'export, par la règle `@page` de
 * [src/app.css](src/app.css) et par le test de tenue en page : elles doivent
 * bouger ensemble, sinon le contrôle ne contrôle plus rien.
 */
const MM_TO_PX = 96 / 25.4;

export const PAGE_WIDTH = Math.round((297 - 24) * MM_TO_PX);
export const PAGE_HEIGHT = Math.round((210 - 24) * MM_TO_PX);

/** Place prise par le titre et le chapeau au-dessus du diagramme. */
export const SECTION_TITLE_HEIGHT = 46;

/** Hauteur réellement disponible pour le diagramme sur sa page. */
export const SANKEY_ROOM = PAGE_HEIGHT - SECTION_TITLE_HEIGHT;

/**
 * Réglages serrés du diagramme pour l'impression. Ils suffisent à un budget
 * ordinaire — les 36 lignes du seed tiennent en ~590px sur les 657 disponibles
 * — mais la hauteur dépend aussi de l'écart entre les montants, pas seulement
 * du nombre de lignes. Un budget plus dense est donc mis à l'échelle par le
 * composant (`fitScale`) plutôt que coupé en deux par un saut de page.
 */
export const PRINT_SANKEY = {
  rowHeight: 13,
  gap: 4,
  labelStep: 12,
  labelReserve: 170,
  minHeight: 200
} as const;
