import { fail, redirect } from '@sveltejs/kit';
import { MIN_PASSWORD, authMessage, emailRedirect, verifyUrl } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { session } = await locals.safeGetSession();
  if (session) redirect(303, '/budgets');
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const displayName = String(form.get('display_name') ?? '').trim();

    if (password.length < MIN_PASSWORD) {
      return fail(400, { email, displayName, error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` });
    }

    const { data, error } = await locals.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
        emailRedirectTo: emailRedirect(url.origin, '/budgets')
      }
    });
    if (error) return fail(400, { email, displayName, error: authMessage(error) });

    // Session immédiate = confirmation d'email désactivée sur le projet.
    if (data.session) redirect(303, '/budgets');

    // Adresse déjà confirmée : Supabase ne le dit pas (pour ne pas révéler qui
    // est inscrit), renvoie un utilisateur sans identité et n'envoie *aucun*
    // email. Sans cette garde, on annonçait un email qui n'arriverait jamais.
    if (data.user && data.user.identities?.length === 0) {
      return fail(400, { email, displayName, exists: true, error: 'Un compte existe déjà avec cette adresse.' });
    }

    // Compte en attente : renvoyé ici, Supabase renvoie aussi le code.
    redirect(303, verifyUrl(email, { sent: true }));
  }
};
