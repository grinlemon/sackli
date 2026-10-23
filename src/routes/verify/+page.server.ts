import { fail, redirect } from '@sveltejs/kit';
import { RESEND_COOLDOWN, authMessage, emailRedirect, otpCode, retryAfter, safeNext } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

/**
 * Étape « vérifiez vos emails », après l'inscription ou une connexion refusée
 * faute de confirmation. L'email porte un lien *et* un code : le code se tape
 * dans l'onglet déjà ouvert, sur n'importe quel appareil, et survit aux
 * antivirus de messagerie qui « cliquent » les liens pour les inspecter —
 * consommant au passage un lien à usage unique avant son destinataire.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const { session } = await locals.safeGetSession();
  if (session) redirect(303, safeNext(url.searchParams.get('next')));

  return {
    email: url.searchParams.get('email') ?? '',
    // Un email vient de partir : le renvoi attend le délai imposé par Supabase.
    sent: url.searchParams.has('sent')
  };
};

export const actions: Actions = {
  verify: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const code = otpCode(String(form.get('code') ?? ''));
    if (!email) return fail(400, { email, error: 'Indiquez votre email.' });
    if (!code) return fail(400, { email, error: 'Le code fait 6 chiffres : copiez-le depuis l’email reçu.' });

    // `email` couvre la confirmation d'inscription : Supabase compare le code
    // au jeton de confirmation, et ouvre la session dans la foulée.
    const { error } = await locals.supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) return fail(400, { email, error: authMessage(error) });

    redirect(303, safeNext(url.searchParams.get('next')));
  },

  /** Le lien comme le code expirent au bout d'une heure, ou se perdent dans les spams. */
  resend: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!email) return fail(400, { email, error: 'Indiquez votre email.' });

    const { error } = await locals.supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirect(url.origin, '/budgets') }
    });
    if (error) return fail(400, { email, error: authMessage(error), cooldown: retryAfter(error) });

    // L'heure rend chaque envoi visible : sans elle, un deuxième clic affichait
    // mot pour mot le même message et semblait ne rien faire.
    return { email, resent: true, sentAt: Date.now(), cooldown: RESEND_COOLDOWN };
  }
};
