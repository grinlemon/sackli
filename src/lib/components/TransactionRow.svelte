<script lang="ts">
  import { monthlyAmount, shareOf } from '$lib/budget/calc';
  import type { BudgetState } from '$lib/budget/state.svelte';
  import { GRID_COLS } from '$lib/budget/ui';
  import { money } from '$lib/format';
  import { rowAccent } from '$lib/budget/colors';
  import SplitEditor from './SplitEditor.svelte';
  import { categoryTree, type BudgetCategory, type BudgetMember, type Transaction } from '$lib/types';

  interface Props {
    tx: Transaction;
    members: BudgetMember[];
    categories: BudgetCategory[];
    sheet: BudgetState;
    /** La grille est groupée : la racine est portée par l'en-tête du groupe. */
    grouped?: boolean;
    /** Racine du groupe qui coiffe cette ligne ; null = groupe « Non classé ». */
    root?: BudgetCategory | null;
  }
  let { tx, members, categories, sheet, grouped = false, root = null }: Props = $props();

  const tree = $derived(categoryTree(categories));
  const accent = $derived(rowAccent(tx.category_id, categories));

  /** Chemin complet, pour l'infobulle : la colonne peut couper un nom long. */
  const categoryPath = $derived.by(() => {
    const own = categories.find((c) => c.id === tx.category_id);
    if (!own) return 'Non classé';
    if (own.parent_id === null) return own.name;
    const parent = categories.find((c) => c.id === own.parent_id);
    return parent ? `${parent.name} › ${own.name}` : own.name;
  });

  // Toutes les cellules partagent police, taille et couleur : rien dans la
  // grille ne doit se lire comme une information de second rang.
  const cell =
    'w-full min-w-0 rounded border-0 bg-transparent px-1 py-1 text-[13px] text-fg outline-none hover:bg-bg focus:bg-bg focus:outline focus:outline-line';

  interface Opt {
    value: string;
    label: string;
  }
  /** `label: null` = options hors optgroup. */
  interface OptGroup {
    label: string | null;
    options: Opt[];
  }

  /**
   * Les options de la colonne Catégorie, en données plutôt qu'en markup : les
   * deux modes n'ont pas le même contenu mais doivent rendre le même `<select>`.
   *
   * Groupé, la colonne ne montre plus que la sous-catégorie — la racine est déjà
   * lisible dans l'en-tête du groupe, la répéter à chaque ligne serait du bruit.
   * Le reste de l'arbre reste atteignable pour déplacer la ligne ailleurs.
   */
  const categoryOptions = $derived.by((): OptGroup[] => {
    if (!grouped) {
      return [
        { label: null, options: [{ value: '', label: '—' }] },
        ...tree.map(({ root: r, children }) =>
          children.length === 0
            ? { label: null, options: [{ value: r.id, label: r.name }] }
            : {
                label: r.name,
                options: [
                  { value: r.id, label: `${r.name} (général)` },
                  ...children.map((c) => ({ value: c.id, label: c.name }))
                ]
              }
        )
      ];
    }

    // « — » signifie « dans ce groupe, sans sous-catégorie ».
    const own: OptGroup = root
      ? {
          label: null,
          options: [
            { value: root.id, label: '—' },
            ...categories
              .filter((c) => c.parent_id === root.id)
              .map((c) => ({ value: c.id, label: c.name }))
          ]
        }
      : { label: null, options: [{ value: '', label: '—' }] };

    const elsewhere: Opt[] = root ? [{ value: '', label: 'Non classé' }] : [];
    for (const { root: r, children } of tree) {
      if (r.id === root?.id) continue;
      elsewhere.push({ value: r.id, label: r.name });
      for (const c of children) elsewhere.push({ value: c.id, label: `${r.name} › ${c.name}` });
    }

    return [own, { label: 'Déplacer vers', options: elsewhere }];
  });

</script>

<!-- Le liseré garde sa largeur même sans catégorie, sinon les lignes classées
     et non classées ne s'alignent plus. -->
<div
  class="{GRID_COLS} min-h-[48px] border-t border-l-[3px] border-line px-3.5"
  style="border-left-color: {accent?.stripe ?? 'transparent'}; background-color: {accent?.background ??
    'transparent'}"
>
  <select
    class="{cell} appearance-none"
    value={tx.kind}
    onchange={(e) => sheet.patch(tx.id, { kind: e.currentTarget.value as Transaction['kind'] }, 0)}
  >
    <option value="income">Entrée</option>
    <option value="expense">Sortie</option>
  </select>

  <input class={cell} value={tx.name} oninput={(e) => sheet.patch(tx.id, { name: e.currentTarget.value })} />

  <input
    class="{cell} num text-right"
    type="number"
    step="0.01"
    value={tx.amount}
    oninput={(e) => sheet.patch(tx.id, { amount: Number(e.currentTarget.value) || 0 })}
  />

  <!-- Un seul select, deux jeux d'options selon que la grille est groupée ou non. -->
  <select
    class="{cell} appearance-none"
    value={tx.category_id ?? ''}
    title={categoryPath}
    onchange={(e) => sheet.patch(tx.id, { category_id: e.currentTarget.value || null }, 0)}
  >
    {#each categoryOptions as group, i (i)}
      {#if group.label === null}
        {#each group.options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      {:else}
        <optgroup label={group.label}>
          {#each group.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
      {/if}
    {/each}
  </select>

  <select
    class="{cell} appearance-none"
    value={tx.frequency}
    onchange={(e) =>
      sheet.patch(tx.id, { frequency: e.currentTarget.value as Transaction['frequency'] }, 0)}
  >
    <option value="monthly">Mensuel</option>
    <option value="yearly">Annuel</option>
  </select>

  <select
    class="{cell} appearance-none"
    value={tx.member_id ?? ''}
    onchange={(e) => sheet.setMember(tx.id, e.currentTarget.value || null)}
  >
    <option value="">Commun</option>
    {#each members as member (member.id)}
      <option value={member.id}>{member.display_name}</option>
    {/each}
  </select>

  <SplitEditor {tx} {members} {sheet} />

  <span
    class="num truncate px-1 text-right"
    title={members.map((m) => `${m.display_name} : ${money(shareOf(tx, m.id, members))}`).join('\n')}
  >
    {money(monthlyAmount(tx))}
  </span>

  <input
    class={cell}
    placeholder="—"
    value={tx.account ?? ''}
    oninput={(e) => sheet.patch(tx.id, { account: e.currentTarget.value || null })}
  />

  <button
    class="flex h-full w-full items-center justify-center border-0 bg-transparent text-muted hover:text-danger"
    aria-label="Supprimer la ligne"
    onclick={() => sheet.remove(tx.id)}
  >
    ×
  </button>
</div>
