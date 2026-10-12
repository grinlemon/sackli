/**
 * Largeur plancher de la grille. Elle est calculée, pas choisie : c'est ce
 * qu'il faut pour que la colonne Catégorie affiche en entier l'étiquette la
 * plus longue que le jeu par défaut puisse produire — « Transports publics &
 * parking », 28 caractères, ~193px avec son padding. Les autres colonnes sont
 * réglées sur le même principe, chacune avec quelques pixels de marge.
 *
 * En dessous, on préfère laisser le conteneur défiler plutôt que rogner le
 * contenu : une catégorie coupée en plein milieu ne se lit pas, et le curseur
 * de répartition n'a plus de course utile.
 *
 * Partagée par les lignes et par les en-têtes de groupe, qui doivent s'aligner
 * sur la même largeur pour ne pas se décaler pendant le défilement horizontal.
 */
export const GRID_MIN_W = 'min-w-[1060px]';

/**
 * Gabarit de colonnes partagé par l'en-tête et les lignes de la grille.
 *
 * Les colonnes à contenu borné (type, montant, fréquence, total) sont fixes ;
 * les autres se partagent le reste en `fr`. Les proportions sont réglées pour
 * qu'au plancher ci-dessus chacune tienne son pire cas : Catégorie 199px,
 * Nom 151px (« Investissement bourse »), Répartition 164px (barre +
 * « Selon les revenus », le plus long des résumés de `SplitEditor`), Concerné 87px (un prénom), Compte 77px (« Raiffeisen »).
 */
export const GRID_COLS =
  `grid grid-cols-[64px_minmax(0,1.25fr)_76px_minmax(0,1.65fr)_82px_minmax(0,0.72fr)_minmax(0,1.36fr)_84px_minmax(0,0.64fr)_22px] items-center gap-x-1.5 ${GRID_MIN_W}`;
