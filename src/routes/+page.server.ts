import type { PageServerLoad } from './$types';

/**
 * La landing page est publique : on ne redirige plus, on adapte seulement
 * l'appel à l'action — « Mes budgets » pour qui est déjà connecté.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const { session } = await locals.safeGetSession();
  // `?deleted` : retour de la suppression de compte, qui ne peut plus rediriger vers l'app.
  return { signedIn: Boolean(session), deleted: url.searchParams.has('deleted') };
};
