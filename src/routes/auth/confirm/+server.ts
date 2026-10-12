import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import { landingFor } from '$lib/auth';
import type { RequestHandler } from './$types';

const INVALID = 'Lien invalide ou expiré.';

/**
 * Point d'arrivée de tous les liens envoyés par email : confirmation
 * d'inscription comme mot de passe oublié.
 *
 * `token_hash` est le flux visé par les templates de supabase/templates/ : il ne
 * dépend d'aucun cookie, donc ouvrir l'email sur le téléphone après avoir fait
 * la demande sur l'ordinateur fonctionne.
 *
 * `code` est le flux PKCE, celui des templates par défaut de Supabase : il
 * exige le navigateur de la demande, mais l'accepter ici évite qu'un projet
 * dont on a oublié de coller les templates envoie des liens qui ne mènent nulle part.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const tokenHash = url.searchParams.get('token_hash');
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next');
  const recovery = type === 'recovery' || next === '/reset-password';

  const { error } = tokenHash && type
    ? await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await locals.supabase.auth.exchangeCodeForSession(code)
      : { error: true };

  if (error) {
    redirect(303, `${recovery ? '/forgot-password' : '/login'}?error=${encodeURIComponent(INVALID)}`);
  }
  redirect(303, landingFor(recovery ? 'recovery' : type, next));
};
