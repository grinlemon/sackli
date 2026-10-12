import type { SupabaseClient } from '@supabase/supabase-js';
import type { Budget, BudgetCategory, BudgetMember, Transaction } from '$lib/types';

export interface LoadedBudget {
  budget: Budget;
  members: BudgetMember[];
  categories: BudgetCategory[];
  transactions: Transaction[];
}

/**
 * Un budget complet, tel que l'écran le montre et que l'export le sauvegarde :
 * une seule lecture pour les deux, pour qu'un fichier exporté ne puisse pas
 * contenir autre chose que ce qu'on voit.
 *
 * null quand la ligne est absente — RLS filtre déjà, donc « pas membre » et
 * « n'existe pas » se confondent, et c'est voulu.
 */
export async function loadBudget(supabase: SupabaseClient, id: string): Promise<LoadedBudget | null> {
  const { data: budget } = await supabase
    .from('budgets')
    .select('id, owner_id, name, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!budget) return null;

  const [{ data: members }, { data: categories }, { data: transactions }] = await Promise.all([
    supabase
      .from('budget_members')
      .select('id, budget_id, user_id, invite_email, display_name, position')
      .eq('budget_id', id)
      .order('position'),
    // Racines et sous-catégories dans le même tableau : l'ordre par position
    // suffit, le regroupement se fait côté client via categoryTree().
    supabase
      .from('budget_categories')
      .select('id, budget_id, parent_id, name, color, position')
      .eq('budget_id', id)
      .order('position'),
    supabase
      .from('transactions')
      .select(
        'id, budget_id, name, kind, amount, category_id, frequency, member_id, account, position, splits:transaction_splits(transaction_id, member_id, weight)'
      )
      .eq('budget_id', id)
      .order('position')
  ]);

  return {
    budget: budget as Budget,
    members: (members ?? []) as BudgetMember[],
    categories: (categories ?? []) as BudgetCategory[],
    transactions: (transactions ?? []).map((t) => ({
      ...t,
      amount: Number(t.amount)
    })) as Transaction[]
  };
}
