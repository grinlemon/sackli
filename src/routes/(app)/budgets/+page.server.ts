import { fail, redirect } from '@sveltejs/kit';
import { parseBackup } from '$lib/budget/backup';
import { STARTER_ROWS, seedCategoryId } from '$lib/budget/seed';
import type { Actions } from './$types';

/** Un budget réel pèse quelques dizaines de Ko ; au-delà, ce n'en est pas un. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const { user } = await locals.safeGetSession();
    if (!user) redirect(303, '/login');

    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const partner = String(form.get('partner_name') ?? '').trim();
    const partnerEmail = String(form.get('partner_email') ?? '').trim();
    const seed = form.get('seed') === 'on';

    if (!name) return fail(400, { error: 'Donnez un nom au budget.' });

    const { data: budget, error } = await locals.supabase
      .from('budgets')
      .insert({ name, owner_id: user.id })
      .select('id')
      .single();
    if (error || !budget) return fail(400, { error: error?.message ?? 'Création impossible.' });

    // Le membre #1 (le propriétaire) est créé par trigger côté base.
    if (partner) {
      await locals.supabase.from('budget_members').insert({
        budget_id: budget.id,
        display_name: partner,
        invite_email: partnerEmail || null,
        position: 2
      });
    }

    if (seed) {
      // Les catégories par défaut sont semées par trigger à l'insertion du
      // budget ; on les relit pour traduire les noms de la trame en id.
      const [{ data: members }, { data: categories }] = await Promise.all([
        locals.supabase
          .from('budget_members')
          .select('id, display_name, position')
          .eq('budget_id', budget.id)
          .order('position'),
        // Racines *et* sous-catégories : la trame vise le niveau fin.
        locals.supabase
          .from('budget_categories')
          .select('id, parent_id, name')
          .eq('budget_id', budget.id)
      ]);

      const first = members?.[0]?.id ?? null;
      const second = members?.[1]?.id ?? null;
      // Sans second membre, ses lignes n'ont personne à qui être rattachées :
      // elles deviendraient communes par défaut, ce qui n'est pas ce qu'elles disent.
      const rows = STARTER_ROWS.filter((row) => row.owner !== 'b' || second);

      await locals.supabase.from('transactions').insert(
        rows.map((row, position) => ({
          budget_id: budget.id,
          name: row.name,
          kind: row.kind,
          amount: row.amount,
          category_id: seedCategoryId(row, categories ?? []),
          frequency: row.frequency,
          member_id: row.owner === 'a' ? first : row.owner === 'b' ? second : null,
          account: row.account || null,
          position
        }))
      );
    }

    redirect(303, `/budgets/${budget.id}`);
  },

  /**
   * La copie est faite par `duplicate_budget()` côté base : cinq tables liées,
   * donc une seule transaction plutôt qu'une dizaine d'allers-retours dont
   * l'échec à mi-parcours laisserait un budget à moitié peuplé.
   */
  duplicate: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const name = String(form.get('name') ?? '').trim();
    if (!id) return fail(400, { error: 'Budget introuvable.' });

    const { data: copy, error } = await locals.supabase.rpc('duplicate_budget', {
      source_id: id,
      new_name: name || null
    });
    if (error || !copy) return fail(400, { error: error?.message ?? 'Duplication impossible.' });

    redirect(303, `/budgets/${copy}`);
  },

  /**
   * Le fichier est validé ici (messages lisibles, ligne fautive nommée), puis
   * `import_budget()` l'écrit d'un bloc côté base, comme `duplicate_budget()`.
   */
  import: async ({ request, locals }) => {
    const form = await request.formData();
    const file = form.get('file');
    const name = String(form.get('name') ?? '').trim();

    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'Choisissez un fichier d\'export (.json).' });
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return fail(400, { error: 'Fichier trop volumineux pour un export de budget.' });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return fail(400, { error: 'Ce fichier n\'est pas du JSON valide.' });
    }
    const parsed = parseBackup(raw);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const { data: id, error } = await locals.supabase.rpc('import_budget', {
      payload: parsed.backup,
      new_name: name || null
    });
    if (error || !id) return fail(400, { error: error?.message ?? 'Import impossible.' });

    redirect(303, `/budgets/${id}`);
  },

  remove: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const { error } = await locals.supabase.from('budgets').delete().eq('id', id);
    if (error) return fail(400, { error: error.message });
    return { deleted: true };
  }
};
