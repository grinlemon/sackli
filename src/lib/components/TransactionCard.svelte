<script lang="ts">
  import { monthlyAmount } from '$lib/budget/calc';
  import { rowAccent } from '$lib/budget/colors';
  import { money } from '$lib/format';
  import type { BudgetCategory, BudgetMember, Transaction } from '$lib/types';

  /**
   * Une ligne du budget en lecture, pour les écrans où la grille ne tient pas.
   * Le montant affiché est le **mensuel**, comme la colonne « par mois » : c'est
   * le seul chiffre qui rende deux lignes comparables. L'annuel brut suit en
   * second rang, pour qu'on reconnaisse ce qu'on a saisi.
   */
  interface Props {
    tx: Transaction;
    members: BudgetMember[];
    categories: BudgetCategory[];
    /** Groupé : la racine est dans l'en-tête, la carte ne nomme que la sous-catégorie. */
    grouped?: boolean;
    onopen: () => void;
  }
  let { tx, members, categories, grouped = false, onopen }: Props = $props();

  const accent = $derived(rowAccent(tx.category_id, categories));

  const category = $derived.by(() => {
    const own = categories.find((c) => c.id === tx.category_id);
    if (!own) return grouped ? null : 'Non classé';
    if (own.parent_id === null) return grouped ? null : own.name;
    if (grouped) return own.name;
    const parent = categories.find((c) => c.id === own.parent_id);
    return parent ? `${parent.name} › ${own.name}` : own.name;
  });

  const who = $derived(
    tx.member_id ? (members.find((m) => m.id === tx.member_id)?.display_name ?? 'Commun') : 'Commun'
  );

  const details = $derived(
    [category, who, tx.frequency === 'yearly' ? `${money(tx.amount)} / an` : null, tx.account]
      .filter(Boolean)
      .join(' · ')
  );
</script>

<button
  class="flex min-h-[58px] w-full items-center gap-3 border-0 border-t border-l-[3px] border-line px-3.5 py-2.5 text-left active:brightness-95"
  style="border-left-color: {accent?.stripe ?? 'transparent'}; background-color: {accent?.background ??
    'var(--color-panel)'}"
  onclick={onopen}
>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[15px] font-medium text-fg">{tx.name || 'Sans nom'}</span>
    <span class="mt-0.5 block truncate text-[12.5px] text-muted">{details}</span>
  </span>
  <span class="num shrink-0 text-right text-[15px] font-semibold {tx.kind === 'income' ? 'text-deep' : 'text-fg'}">
    {tx.kind === 'income' ? '+' : ''}{money(monthlyAmount(tx))}
  </span>
  <span class="shrink-0 text-[16px] text-[#b5bdb9]" aria-hidden="true">›</span>
</button>
