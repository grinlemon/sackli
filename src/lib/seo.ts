/**
 * Référencement : les seules pages qu'un moteur doit indexer. Tout le reste —
 * l'app derrière la connexion, les liens d'email, la récupération de mot de
 * passe — n'a rien à faire dans un résultat de recherche ; `hooks.server.ts`
 * le marque `noindex`, `robots.txt` l'écarte, et le sitemap ne liste que ceci.
 *
 * Les URL absolues se construisent sur `url.origin` au moment de la requête,
 * comme `emailRedirect()` : c'est le déploiement réel qui décide, aucun
 * domaine n'est écrit en dur.
 */
export const INDEXABLE = ['/', '/demo', '/signup', '/login'] as const;

export function isIndexable(pathname: string): boolean {
  return (INDEXABLE as readonly string[]).includes(pathname);
}

/**
 * Version de `static/og.png`, l'image d'aperçu des liens partagés. LinkedIn,
 * WhatsApp ou Slack gardent une image en cache tant que son URL ne change
 * pas : à monter à chaque `npm run og`, sans quoi l'ancien aperçu survit.
 */
export const OG_VERSION = 2;

/** URL absolue de l'image d'aperçu — les réseaux n'acceptent pas de chemin relatif. */
export function ogImage(origin: string): string {
  return `${origin}/og.png?v=${OG_VERSION}`;
}
