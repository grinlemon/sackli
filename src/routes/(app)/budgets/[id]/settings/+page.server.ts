import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

/** Les contraintes de la base sont la source de vérité ; on traduit juste. */
function friendly(error: { code?: string; message: string }) {
  if (error.code === '23505') return 'Une catégorie porte déjà ce nom à ce niveau.';
  if (error.code === '23514') return 'Couleur invalide.';
  return error.message;
}

export const actions: Actions = {
  rename: async ({ request, locals, params }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Le nom ne peut pas être vide.' });

    const { error } = await locals.supabase.from('budgets').update({ name }).eq('id', params.id);
    if (error) return fail(400, { error: error.message });
    return { ok: 'Budget renommé.' };
  },

  /**
   * Applique une même répartition à **toutes** les dépenses communes.
   *
   * Les parts arrivent en pourcentages et sont stockées sur une base de 10 000
   * plutôt que 100 : `weight` est un `smallint`, et au centième de pourcent
   * l'égalisation des restes tombe juste au centime près au lieu de laisser
   * quelques francs d'écart. Le reste de l'app n'y voit rien, `shareOf`
   * normalisant les poids ligne par ligne.
   */
  balanceCommon: async ({ request, locals, params }) => {
    const form = await request.formData();

    const { data: members } = await locals.supabase
      .from('budget_members')
      .select('id')
      .eq('budget_id', params.id)
      .order('position');
    if (!members?.length) return fail(400, { error: 'Ce budget n\'a aucun membre.' });

    const weights = members.map((m) => ({
      member_id: m.id,
      weight: Math.max(Math.round((Number(form.get(`part_${m.id}`)) || 0) * 100), 0)
    }));
    if (weights.reduce((a, w) => a + w.weight, 0) <= 0) {
      return fail(400, { error: 'Au moins une part doit être non nulle.' });
    }

    const { data: common } = await locals.supabase
      .from('transactions')
      .select('id')
      .eq('budget_id', params.id)
      .eq('kind', 'expense')
      .is('member_id', null);

    const ids = (common ?? []).map((t) => t.id);
    if (ids.length === 0) return fail(400, { error: 'Aucune dépense commune à répartir.' });

    // Table rase : une ligne qui gardait une répartition réglée à la main doit
    // suivre la nouvelle, sinon « toutes les lignes communes » serait faux.
    const { error: cleared } = await locals.supabase
      .from('transaction_splits')
      .delete()
      .in('transaction_id', ids);
    if (cleared) return fail(400, { error: cleared.message });

    // Des parts égales sont le défaut implicite du modèle : on n'écrit alors
    // aucune ligne plutôt que de matérialiser ce qui va déjà de soi.
    const uniform = weights.every((w) => w.weight === weights[0].weight);
    if (!uniform) {
      const rows = ids.flatMap((transaction_id) =>
        weights.map((w) => ({ transaction_id, ...w }))
      );
      const { error } = await locals.supabase.from('transaction_splits').insert(rows);
      if (error) return fail(400, { error: error.message });
    }

    const n = ids.length;
    return {
      ok: `Répartition appliquée à ${n} ligne${n > 1 ? 's' : ''} commune${n > 1 ? 's' : ''}.`
    };
  },

  addMember: async ({ request, locals, params }) => {
    const form = await request.formData();
    const displayName = String(form.get('display_name') ?? '').trim();
    const email = String(form.get('invite_email') ?? '').trim();
    if (!displayName) return fail(400, { error: 'Donnez un nom au membre.' });

    const { data: existing } = await locals.supabase
      .from('budget_members')
      .select('position')
      .eq('budget_id', params.id)
      .order('position', { ascending: false })
      .limit(1);

    const { error } = await locals.supabase.from('budget_members').insert({
      budget_id: params.id,
      display_name: displayName,
      invite_email: email || null,
      position: (existing?.[0]?.position ?? 0) + 1
    });
    if (error) return fail(400, { error: error.message });
    return { ok: `${displayName} a été ajouté.` };
  },

  updateMember: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const displayName = String(form.get('display_name') ?? '').trim();
    const email = String(form.get('invite_email') ?? '').trim();
    if (!displayName) return fail(400, { error: 'Le nom ne peut pas être vide.' });

    const { error } = await locals.supabase
      .from('budget_members')
      .update({ display_name: displayName, invite_email: email || null })
      .eq('id', id);
    if (error) return fail(400, { error: error.message });
    return { ok: 'Membre mis à jour.' };
  },

  removeMember: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const { error } = await locals.supabase.from('budget_members').delete().eq('id', id);
    if (error) return fail(400, { error: error.message });
    return { ok: 'Membre retiré.' };
  },

  addCategory: async ({ request, locals, params }) => {
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const parentId = String(form.get('parent_id') ?? '') || null;
    const color = String(form.get('color') ?? '').trim();
    if (!name) return fail(400, { error: 'Donnez un nom à la catégorie.' });

    // Position à la suite des sœurs, pas à la suite de tout le budget : les
    // sous-catégories ont leur propre ordre sous leur parent.
    let query = locals.supabase
      .from('budget_categories')
      .select('position')
      .eq('budget_id', params.id)
      .order('position', { ascending: false })
      .limit(1);
    query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
    const { data: siblings } = await query;

    const { error } = await locals.supabase.from('budget_categories').insert({
      budget_id: params.id,
      parent_id: parentId,
      name,
      // La contrainte budget_categories_color_on_root_only impose l'un ou l'autre.
      color: parentId ? null : color || '#6b716e',
      position: (siblings?.[0]?.position ?? -1) + 1
    });
    if (error) return fail(400, { error: friendly(error) });
    return { ok: `« ${name} » a été ajoutée.` };
  },

  updateCategory: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const name = String(form.get('name') ?? '').trim();
    const color = String(form.get('color') ?? '').trim();
    if (!name) return fail(400, { error: 'Le nom ne peut pas être vide.' });

    // Le champ couleur n'existe que sur les racines : son absence dit le niveau.
    const fields = color ? { name, color } : { name };
    const { error } = await locals.supabase.from('budget_categories').update(fields).eq('id', id);
    if (error) return fail(400, { error: friendly(error) });
    return { ok: 'Catégorie mise à jour.' };
  },

  removeCategory: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const { error } = await locals.supabase.from('budget_categories').delete().eq('id', id);
    if (error) return fail(400, { error: friendly(error) });
    return { ok: 'Catégorie supprimée. Les lignes concernées sont désormais sans catégorie.' };
  }
};
