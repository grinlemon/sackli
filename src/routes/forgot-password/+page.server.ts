import { fail } from '@sveltejs/kit';
import { authMessage, emailRedirect } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
  email: url.searchParams.get('email') ?? '',
  error: url.searchParams.get('error')
});

export const actions: Actions = {
  default: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!email) return fail(400, { email, error: 'Indiquez votre email.' });

    const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: emailRedirect(url.origin, '/reset-password')
    });
    // Supabase répond pareil qu'un compte existe ou non ; seul un vrai refus
    // (limite d'envoi, adresse malformée) mérite d'être affiché.
    if (error) return fail(400, { email, error: authMessage(error) });

    return { email, sent: true };
  }
};
