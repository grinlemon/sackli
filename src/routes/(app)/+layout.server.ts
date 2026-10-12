import { redirect } from '@sveltejs/kit';
import type { Budget } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const { session, user } = await locals.safeGetSession();
  if (!session || !user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);

  // Rattache les places qui attendaient cet email. UPDATE indexé, zéro ligne
  // dans le cas courant ; couvre le cas d'une invitation reçue après inscription.
  await locals.supabase.rpc('claim_memberships');

  const { data: budgets } = await locals.supabase
    .from('budgets')
    .select('id, owner_id, name, created_at')
    .order('created_at', { ascending: true });

  return {
    user,
    budgets: (budgets ?? []) as Budget[],
    displayName: (user.user_metadata?.display_name as string) ?? user.email?.split('@')[0] ?? ''
  };
};
