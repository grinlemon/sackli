/** Montant nu, sans devise — pour les étiquettes serrées d'un graphique. */
export function amount(n: number): string {
  return Math.round(n).toLocaleString('fr-CH').replace(/ | |’/g, "'");
}

/** CHF au format fr-CH, avec l'apostrophe suisse comme séparateur de milliers. */
export function money(n: number): string {
  return 'CHF ' + amount(n);
}

export function pct(n: number): string {
  return Math.round(n) + '%';
}

/**
 * Part d'un total, pour les étiquettes d'un graphique. Sous 0,5 % l'arrondi
 * afficherait « 0 % », ce qui se lit comme une erreur plutôt que comme « peu ».
 */
export function shareOfTotal(value: number, total: number): string {
  if (total <= 0) return '—';
  const share = (value / total) * 100;
  if (share > 0 && share < 0.5) return '<1%';
  return pct(share);
}
