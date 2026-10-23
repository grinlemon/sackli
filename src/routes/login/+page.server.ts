import { fail, redirect } from '@sveltejs/kit';
import { authMessage, safeNext, verifyUrl } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const { session } = await locals.safeGetSession();
  if (session) redirect(303, safeNext(url.searchParams.get('next')));

  return {
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
    // Pas un cul-de-sac : on mène à l'étape du code, qui sait en renvoyer un.
    if (error?.code === 'email_not_confirmed') {
      redirect(303, verifyUrl(email, { next: url.searchParams.get('next') }));
    }
    if (error) {
      return fail(400, {
        email,
        error: error.code === 'invalid_credentials' ? 'Email ou mot de passe incorrect.' : authMessage(error)
      });
    }

    redirect(303, safeNext(url.searchParams.get('next')));
  }
};
