import { fail, redirect } from '@sveltejs/kit';
import { MIN_PASSWORD, authMessage, emailRedirect } from '$lib/auth';
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
    redirect(303, `/login?checkEmail=1&email=${encodeURIComponent(email)}`);
  }
};
