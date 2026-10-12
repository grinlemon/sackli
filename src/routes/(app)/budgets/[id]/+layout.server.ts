import { error } from '@sveltejs/kit';
import { loadBudget } from '$lib/budget/load';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
  const loaded = await loadBudget(locals.supabase, params.id);
  // RLS filtre déjà : une ligne absente signifie "pas membre" ou "n'existe pas".
  if (!loaded) error(404, 'Budget introuvable');
  return loaded;
};
