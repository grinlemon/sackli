import { error, redirect } from '@sveltejs/kit';
import { backupFilename, toBackup } from '$lib/budget/backup';
import { loadBudget } from '$lib/budget/load';
import type { RequestHandler } from './$types';

/**
 * Sauvegarde JSON du budget, à réimporter depuis « Mes budgets ». Une route
 * serveur et non un layout : les `load` de (app) ne tournent pas pour elle,
 * d'où la vérification de session faite ici.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  const { user } = await locals.safeGetSession();
  if (!user) redirect(303, '/login');

  const loaded = await loadBudget(locals.supabase, params.id);
  if (!loaded) error(404, 'Budget introuvable');

  const now = new Date();
  return new Response(JSON.stringify(toBackup(loaded, user.id, now), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${backupFilename(loaded.budget.name, now)}"`,
      'cache-control': 'no-store'
    }
  });
};
