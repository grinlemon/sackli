import { fail, redirect } from '@sveltejs/kit';
import { MIN_PASSWORD, authMessage } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

const EXPIRED = '/forgot-password?error=' + encodeURIComponent('Lien expiré. Demandez-en un nouveau.');

/**
 * On arrive ici connecté : /auth/confirm vient d'échanger le lien de
 * récupération contre une session. Sans session, le lien a expiré ou a déjà
 * servi, et il n'y a personne dont changer le mot de passe.
 */
export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) redirect(303, EXPIRED);
  return { email: user.email ?? '' };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) redirect(303, EXPIRED);

    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');

    if (password.length < MIN_PASSWORD) {
      return fail(400, { error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` });
    }
    if (password !== confirm) return fail(400, { error: 'Les deux mots de passe ne correspondent pas.' });

    const { error } = await locals.supabase.auth.updateUser({ password });
    if (error) return fail(400, { error: authMessage(error) });

    redirect(303, '/budgets');
  }
};
