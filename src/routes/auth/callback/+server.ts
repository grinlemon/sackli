import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const INVALID = '/login?error=' + encodeURIComponent('Lien de confirmation invalide ou expiré.');

/**
 * Retour du lien de confirmation (flux PKCE) et, plus tard, des providers OAuth.
 * Supabase redirige ici avec un `code` à échanger contre une session —
 * sans cet échange, le lien de l'email ne fait rien.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/budgets';

  if (!code) redirect(303, INVALID);

  const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
  if (error) redirect(303, INVALID);

  redirect(303, next);
};
