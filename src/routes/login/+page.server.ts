import { fail, redirect } from '@sveltejs/kit';
import { RESEND_COOLDOWN, authMessage, emailRedirect, retryAfter, safeNext } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

const NOTICES: Record<string, string> = {
  checkEmail: 'Compte créé. Ouvrez le lien reçu par email pour le confirmer, puis connectez-vous.'
};

export const load: PageServerLoad = async ({ locals, url }) => {
  const { session } = await locals.safeGetSession();
  if (session) redirect(303, safeNext(url.searchParams.get('next')));

  const notice = [...url.searchParams.keys()].find((k) => k in NOTICES);
  return {
    notice: notice ? NOTICES[notice] : null,
    error: url.searchParams.get('error'),
    email: url.searchParams.get('email') ?? ''
  };
};

export const actions: Actions = {
  login: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const unconfirmed = error.code === 'email_not_confirmed';
      return fail(400, {
        email,
        unconfirmed,
        error: unconfirmed
          ? "Ce compte existe mais son email n'est pas encore confirmé. Ouvrez le lien reçu par email, ou demandez-en un nouveau."
          : error.code === 'invalid_credentials'
            ? 'Email ou mot de passe incorrect.'
            : authMessage(error)
      });
    }

    redirect(303, safeNext(url.searchParams.get('next')));
  },

  /** Le lien de confirmation expire au bout d'une heure, ou se perd dans les spams. */
  resend: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!email) return fail(400, { email, error: 'Indiquez votre email.' });

    const { error } = await locals.supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirect(url.origin, '/budgets') }
    });
    if (error) {
      return fail(400, { email, unconfirmed: true, error: authMessage(error), cooldown: retryAfter(error) });
    }

    // L'heure rend chaque envoi visible : sans elle, un deuxième clic affichait
    // mot pour mot le même message et semblait ne rien faire.
    return { email, resent: true, sentAt: Date.now(), cooldown: RESEND_COOLDOWN };
  }
};
