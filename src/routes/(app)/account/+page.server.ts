import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Ce que la suppression fera de chaque budget possédé, calculé comme
 * `delete_account()` le fera : transmis s'il a un autre membre rattaché,
 * supprimé sinon. Les budgets des autres ne sont pas listés — on y garde
 * seulement sa place, « hors compte ».
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
  const { user } = await parent();

  const { data } = await locals.supabase
    .from('budgets')
    .select('id, name, budget_members(user_id, display_name, position)')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  const owned = (data ?? []).map((b) => {
    const heir = [...(b.budget_members ?? [])]
      .filter((m) => m.user_id && m.user_id !== user.id)
      .sort((a, c) => a.position - c.position)[0];
    return { id: b.id, name: b.name, heir: heir?.display_name ?? null };
  });

  return {
    transferred: owned.filter((b) => b.heir),
    deleted: owned.filter((b) => !b.heir)
  };
};

export const actions: Actions = {
  delete: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) redirect(303, '/login');

    // Taper son email plutôt que cocher une case : une suppression de compte ne
    // doit pas pouvoir partir d'un clic distrait.
    const form = await request.formData();
    const typed = String(form.get('confirm') ?? '').trim().toLowerCase();
    if (typed !== (user.email ?? '').toLowerCase()) {
      return fail(400, { error: "L'email saisi ne correspond pas à celui du compte." });
    }

    const { error } = await locals.supabase.rpc('delete_account');
    if (error) return fail(500, { error: `Le compte n'a pas pu être supprimé : ${error.message}` });

    // L'utilisateur n'existe plus côté Auth : on ne fait qu'effacer les cookies.
    await locals.supabase.auth.signOut({ scope: 'local' });
    redirect(303, '/?deleted');
  }
};
