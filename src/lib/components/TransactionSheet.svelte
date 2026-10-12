<script lang="ts">
  import { monthlyAmount } from '$lib/budget/calc';
  import type { BudgetState } from '$lib/budget/state.svelte';
  import { money } from '$lib/format';
  import { categoryTree, type BudgetCategory, type BudgetMember, type Transaction } from '$lib/types';
  import SplitEditor from './SplitEditor.svelte';

  /**
   * Fiche d'édition d'une ligne, en panneau montant du bas de l'écran — la
   * grille, sur un téléphone, n'offre ni la place ni des cibles assez grandes.
   *
   * Elle écrit exactement comme la grille, par les mêmes appels à `BudgetState`
   * (optimiste puis debouncé) : il n'y a rien à « valider », fermer la fiche
   * vide simplement les écritures en attente.
   *
   * Un `<dialog>` modal plutôt qu'un div : focus piégé, Échap, et le reste de
   * la page rendu inerte pour les lecteurs d'écran, sans rien réimplémenter.
   */
  interface Props {
    /** La ligne ouverte, ou null pour fermer. */
    tx: Transaction | null;
    members: BudgetMember[];
    categories: BudgetCategory[];
    sheet: BudgetState;
    onclose: () => void;
  }
  let { tx, members, categories, sheet, onclose }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  const tree = $derived(categoryTree(categories));

  $effect(() => {
    if (!dialog) return;
    if (tx && !dialog.open) dialog.showModal();
    if (!tx && dialog.open) dialog.close();
  });

  function close() {
    sheet.flush();
    onclose();
  }

  async function remove() {
    if (!tx || !confirm(`Supprimer « ${tx.name || 'cette ligne'} » ?`)) return;
    const id = tx.id;
    close();
    await sheet.remove(id);
  }

  const field = 'mb-1.5 block text-[12px] font-medium text-[#3d4541]';
  const control =
    'w-full rounded-control border border-line bg-panel px-3 py-2.5 text-fg outline-none focus:border-green focus:ring-2 focus:ring-pale';
</script>

{#snippet segmented<T extends string>(label: string, value: T, options: { value: T; label: string }[], set: (v: T) => void)}
  <div role="radiogroup" aria-label={label} class="flex rounded-control border border-line bg-bg p-0.5">
    {#each options as option (option.value)}
      <button
        type="button"
        role="radio"
        aria-checked={value === option.value}
        class="min-h-[40px] flex-1 rounded-[4px] border-0 text-[14px] {value === option.value
          ? 'bg-panel font-bold text-deep shadow-sm'
          : 'bg-transparent text-muted'}"
        onclick={() => set(option.value)}
      >
        {option.label}
      </button>
    {/each}
  </div>
{/snippet}

<dialog
  bind:this={dialog}
  class="sheet m-0 mt-auto w-full max-w-none border-0 bg-transparent p-0 sm:m-auto sm:max-w-[480px]"
  aria-label="Modifier la ligne"
  onclose={() => tx && close()}
  onclick={(e) => e.target === dialog && close()}
>
  {#if tx}
    <div class="flex max-h-[92dvh] flex-col rounded-t-[14px] bg-panel sm:rounded-card">
      <header class="flex items-center gap-3 border-b border-line px-4 pt-2 pb-3">
        <div class="min-w-0 flex-1">
          <!-- La poignée dit « ça se referme », même si c'est le bouton qui le fait. -->
          <span class="mx-auto mb-2 block h-1 w-9 rounded-full bg-line sm:hidden" aria-hidden="true"></span>
          <p class="m-0 truncate font-serif text-[18px] text-[#34433d]">{tx.name || 'Nouvelle ligne'}</p>
          <p class="num m-0 text-[12.5px] text-muted">
            {money(monthlyAmount(tx))} / mois{tx.frequency === 'yearly' ? ` · ${money(tx.amount)} / an` : ''}
          </p>
        </div>
        <button
          class="min-h-[44px] shrink-0 rounded-control bg-green px-4 font-bold text-[#143b2b]"
          onclick={close}
        >
          OK
        </button>
      </header>

      <div class="min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div class="mb-4">
          {@render segmented('Type', tx.kind, [
            { value: 'expense', label: 'Sortie' },
            { value: 'income', label: 'Entrée' }
          ], (kind) => sheet.patch(tx!.id, { kind }, 0))}
        </div>

        <label class="mb-4 block">
          <span class={field}>Nom</span>
          <input
            class={control}
            value={tx.name}
            autocomplete="off"
            enterkeyhint="done"
            oninput={(e) => sheet.patch(tx!.id, { name: e.currentTarget.value })}
          />
        </label>

        <div class="mb-4 grid grid-cols-[1fr_auto] items-end gap-2.5">
          <label class="block">
            <span class={field}>Montant (CHF)</span>
            <input
              class="{control} num text-right"
              type="number"
              inputmode="decimal"
              step="0.01"
              enterkeyhint="done"
              value={tx.amount}
              oninput={(e) => sheet.patch(tx!.id, { amount: Number(e.currentTarget.value) || 0 })}
            />
          </label>
          <div class="w-[180px]">
            {@render segmented('Fréquence', tx.frequency, [
              { value: 'monthly', label: 'Mensuel' },
              { value: 'yearly', label: 'Annuel' }
            ], (frequency) => sheet.patch(tx!.id, { frequency }, 0))}
          </div>
        </div>

        <label class="mb-4 block">
          <span class={field}>Catégorie</span>
          <select
            class={control}
            value={tx.category_id ?? ''}
            onchange={(e) => sheet.patch(tx!.id, { category_id: e.currentTarget.value || null }, 0)}
          >
            <option value="">Non classé</option>
            {#each tree as { root, children } (root.id)}
              {#if children.length === 0}
                <option value={root.id}>{root.name}</option>
              {:else}
                <optgroup label={root.name}>
                  <option value={root.id}>{root.name} (général)</option>
                  {#each children as child (child.id)}
                    <option value={child.id}>{child.name}</option>
                  {/each}
                </optgroup>
              {/if}
            {/each}
          </select>
        </label>

        <label class="mb-4 block">
          <span class={field}>Concerne</span>
          <select
            class={control}
            value={tx.member_id ?? ''}
            onchange={(e) => sheet.setMember(tx!.id, e.currentTarget.value || null)}
          >
            <option value="">Commun</option>
            {#each members as member (member.id)}
              <option value={member.id}>{member.display_name}</option>
            {/each}
          </select>
        </label>

        {#if members.length > 1}
          <div class="mb-4 rounded-control border border-line bg-bg p-3">
            <span class={field}>Qui paie</span>
            <SplitEditor {tx} {members} {sheet} roomy />
          </div>
        {/if}

        <label class="mb-5 block">
          <span class={field}>Compte</span>
          <input
            class={control}
            placeholder="Optionnel"
            value={tx.account ?? ''}
            enterkeyhint="done"
            oninput={(e) => sheet.patch(tx!.id, { account: e.currentTarget.value || null })}
          />
        </label>

        <button
          class="min-h-[44px] w-full rounded-control border border-[#f0d5d3] bg-panel text-danger"
          onclick={remove}
        >
          Supprimer la ligne
        </button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .sheet::backdrop {
    background: rgb(28 31 29 / 0.4);
  }
  /* Monte du bas : le geste attendu sur un téléphone, et la poignée l'annonce. */
  .sheet[open] {
    animation: rise 180ms ease-out;
  }
  @keyframes rise {
    from {
      transform: translateY(24px);
      opacity: 0.6;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet[open] {
      animation: none;
    }
  }
</style>
