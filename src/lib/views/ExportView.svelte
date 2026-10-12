<script lang="ts">
  import { onMount } from 'svelte';
  import { householdSummary, memberBreakdown, monthlyAmount, shareOf } from '$lib/budget/calc';
  import { groupByCategory, splitBySubcategory } from '$lib/budget/filters';
  import { tint } from '$lib/budget/colors';
  import { PAGE_WIDTH, PRINT_SANKEY, SANKEY_ROOM } from '$lib/budget/print';
  import { buildSankey, type SankeyDetail } from '$lib/budget/sankey';
  import Logo from '$lib/components/Logo.svelte';
  import Sankey from '$lib/components/Sankey.svelte';
  import { money, pct } from '$lib/format';
  import type { BudgetCategory, BudgetMember, Transaction } from '$lib/types';

  /** Le rapport PDF, sorti de sa route pour servir aussi la démo. */
  interface Props {
    data: {
      budget: { name: string };
      members: BudgetMember[];
      categories: BudgetCategory[];
      transactions: Transaction[];
    };
  }
  let { data }: Props = $props();

  // Le document est rendu à la largeur utile d'une page (voir print.ts).
  // L'aperçu à l'écran est donc le tirage : rien ne se recompose au moment
  // d'imprimer, et le diagramme n'a pas à se remesurer.

  const summary = $derived(householdSummary(data.transactions, data.members));
  const breakdowns = $derived(
    data.members.map((m) => memberBreakdown(data.transactions, m, data.members))
  );
  const commonTotal = $derived(
    data.transactions
      .filter((t) => t.kind === 'expense' && t.member_id === null)
      .reduce((a, t) => a + monthlyAmount(t), 0)
  );

  const groups = $derived(groupByCategory(data.transactions, data.categories));
  const blocks = $derived(
    groups.map((group) => ({ group, subs: splitBySubcategory(group, data.categories) }))
  );

  let detail = $state<SankeyDetail>('lines');
  const graph = $derived(buildSankey(data.transactions, data.categories, detail));

  const DETAILS = [
    { key: 'roots' as const, label: 'Catégories' },
    { key: 'children' as const, label: 'Sous-catégories' },
    { key: 'lines' as const, label: 'Lignes' }
  ];

  let unit = $state<'chf' | 'percent'>('chf');
  const UNITS = [
    { key: 'chf' as const, label: 'CHF' },
    { key: 'percent' as const, label: '%' }
  ];

  const FALLBACK = '#b9c6c0';
  const stripe = (color: string | null | undefined) => color ?? FALLBACK;

  const share = (expense: number) => (summary.expenses > 0 ? (expense / summary.expenses) * 100 : 0);

  // Côté serveur la date serait celle du serveur : on la pose après montage
  // pour qu'elle soit toujours celle du lecteur, et sans écart d'hydratation.
  let generated = $state('');

  /**
   * Sur un écran plus étroit que la page, l'aperçu est réduit d'un bloc plutôt
   * que de faire défiler la fenêtre de côté. `zoom` et non `transform` : la
   * boîte rétrécit avec le dessin, sans laisser un vide de la hauteur d'origine.
   * La règle ne vaut qu'à l'écran (voir le style) — le tirage reste à PAGE_WIDTH.
   */
  let frame = $state(0);
  const previewScale = $derived(frame > 0 ? Math.min(1, frame / PAGE_WIDTH) : 1);
  onMount(() => {
    generated = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'long' }).format(new Date());
  });
</script>

<svelte:head><title>{data.budget.name} — Export — säckli</title></svelte:head>

<!-- Barre d'outils : à l'écran seulement, elle ne fait pas partie du document. -->
<div class="flex flex-wrap items-center gap-3 py-5 print:hidden max-sm:py-4">
  <div>
    <p class="m-0 mb-1.5 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">Export</p>
    <p class="m-0 font-serif text-[16px] text-[#4e5752]">
      L'aperçu ci-dessous est le tirage, à la page près.
    </p>
  </div>

  <div class="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full">
    <span class="text-[11px] text-muted max-sm:w-full">Détail du flux</span>
    <div class="flex overflow-hidden rounded-control border border-line">
      {#each UNITS as u (u.key)}
        <button
        class="border-0 px-2.5 py-1.5 text-[11.5px] {unit === u.key
          ? 'bg-pale font-bold text-deep'
          : 'bg-panel text-muted hover:bg-bg'}"
        onclick={() => (unit = u.key)}
        >
        {u.label}
        </button>
      {/each}
    </div>
    <div class="flex overflow-hidden rounded-control border border-line">
      {#each DETAILS as step (step.key)}
        <button
          class="border-0 px-2.5 py-1.5 text-[11.5px] {detail === step.key
            ? 'bg-pale font-bold text-deep'
            : 'bg-panel text-muted hover:bg-bg'}"
          onclick={() => (detail = step.key)}
        >
          {step.label}
        </button>
      {/each}
    </div>
    <button
      class="rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96 max-sm:min-h-[46px] max-sm:w-full"
      onclick={() => window.print()}
    >
      ⎙ Enregistrer en PDF
    </button>
  </div>
</div>

<p class="mb-5 max-w-[640px] rounded-control border border-line bg-panel px-3 py-2.5 text-[11.5px] text-muted print:hidden">
  Le bouton ouvre la fenêtre d'impression : choisissez <b>Enregistrer au format PDF</b> comme
  destination. Laissez le format sur <b>A4 paysage</b> — le document est composé à cette taille.
</p>

<div class="preview" bind:clientWidth={frame} style="--preview-scale: {previewScale}">
<article class="report mx-auto bg-panel text-fg" style="width: {PAGE_WIDTH}px">
  <!-- ------------------------------------------------------------ en-tête -->
  <header class="flex items-end justify-between gap-6 border-b-2 border-deep pb-4">
    <div>
      <div class="mb-2.5"><Logo size={20} text={16} /></div>
      <h1 class="m-0 font-serif text-[26px] font-medium text-[#34433d]">{data.budget.name}</h1>
      <p class="mt-1.5 mb-0 text-[11px] text-muted">
        Budget prévisionnel mensuel · {data.members.map((m) => m.display_name).join(' et ')}
      </p>
    </div>
    <div class="text-right">
      <p class="m-0 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">Reste ménage</p>
      <b class="num font-serif text-[24px] font-medium {summary.remaining < 0 ? 'text-danger' : 'text-deep'}">
        {money(summary.remaining)}
      </b>
      <p class="mt-1 mb-0 text-[10px] text-muted">Établi le {generated}</p>
    </div>
  </header>

  <!-- ------------------------------------------------------- chiffres clés -->
  <section class="sheet-block mt-5">
    <div class="grid grid-cols-4 gap-2.5">
      {#each [{ label: 'Revenus planifiés', value: summary.income, hint: 'entrées du mois' }, { label: 'Sorties prévues', value: summary.expenses, hint: pct(share(summary.expenses)) + ' des revenus' }, { label: 'Dont communes', value: commonTotal, hint: 'à répartir entre membres' }, { label: 'Marge', value: summary.remaining, hint: 'ce qui reste au ménage' }] as card (card.label)}
        <article class="rounded-card border border-line p-3.5">
          <span class="block text-[10px] text-muted">{card.label}</span>
          <strong class="num my-1.5 block font-serif text-[19px] font-medium text-[#34433d]">
            {money(card.value)}
          </strong>
          <small class="block text-[10px] text-muted">{card.hint}</small>
        </article>
      {/each}
    </div>
  </section>

  <!-- ------------------------------------------------- cascade par membre -->
  <section class="sheet-block mt-2.5">
    <div class="grid grid-cols-2 gap-2.5">
      {#each breakdowns as b (b.member.id)}
        <div class="rounded-card border border-line p-3.5">
          <h2 class="m-0 mb-2 font-serif text-[15px] font-medium text-[#34433d]">
            {b.member.display_name}
          </h2>
          <table class="w-full text-[11px]">
            <tbody>
              {#each [{ label: 'Entrée', value: b.income, sign: '' }, { label: 'Participation aux dépenses communes', value: b.common, sign: '−' }, { label: 'Dépenses personnelles', value: b.personal, sign: '−' }] as step (step.label)}
                <tr class="border-b border-line">
                  <td class="py-1 text-muted">{step.label}</td>
                  <td class="num py-1 text-right {step.sign ? 'text-danger' : ''}">
                    {step.sign}{money(step.value)}
                  </td>
                </tr>
              {/each}
              <tr>
                <td class="pt-1.5 font-bold">Reste</td>
                <td class="num pt-1.5 text-right font-serif text-[15px] font-medium {b.remaining < 0 ? 'text-danger' : 'text-deep'}">
                  {money(b.remaining)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  </section>

  <!-- ----------------------------------------------------------- diagramme -->
  <section class="sheet-block mt-5 break-before-page">
    <h2 class="m-0 font-serif text-[17px] font-medium text-[#34433d]">Où va l'argent</h2>
    <p class="mt-1 mb-3 text-[10px] text-muted">
      Des revenus à chaque ligne, épaisseur proportionnelle au montant mensuel.
    </p>
    <Sankey {graph} {unit} width={PAGE_WIDTH} options={PRINT_SANKEY} maxHeight={SANKEY_ROOM} />
  </section>

  <!-- -------------------------------------------------- poids par catégorie -->
  <section class="sheet-block mt-5 break-before-page">
    <h2 class="m-0 mb-3 font-serif text-[17px] font-medium text-[#34433d]">Poids des catégories</h2>
    <table class="w-full border-collapse text-[11px]">
      <thead>
        <tr class="border-b border-line bg-[#fafbfa] text-left">
          <th class="px-2 py-1.5 font-semibold">Catégorie</th>
          <th class="px-2 py-1.5 font-semibold">Sous-catégorie</th>
          <th class="px-2 py-1.5 text-right font-semibold">Lignes</th>
          <th class="px-2 py-1.5 text-right font-semibold">Entrées / mois</th>
          <th class="px-2 py-1.5 text-right font-semibold">Sorties / mois</th>
          <th class="px-2 py-1.5 text-right font-semibold">Part des sorties</th>
        </tr>
      </thead>
      <tbody>
        {#each blocks as { group, subs } (group.key)}
          <tr class="border-b border-line" style="background: {tint(stripe(group.root?.color), 0.09)}">
            <td class="px-2 py-1.5 font-bold" style="box-shadow: inset 3px 0 0 {stripe(group.root?.color)}">
              {group.root?.name ?? 'Non classé'}
            </td>
            <td class="px-2 py-1.5 text-muted">—</td>
            <td class="num px-2 py-1.5 text-right">{group.transactions.length}</td>
            <td class="num px-2 py-1.5 text-right">{group.income > 0 ? money(group.income) : ''}</td>
            <td class="num px-2 py-1.5 text-right font-bold">{money(group.expense)}</td>
            <td class="num px-2 py-1.5 text-right">{group.expense > 0 ? pct(share(group.expense)) : ''}</td>
          </tr>
          {#each subs as sub (sub.key)}
            <tr class="border-b border-line">
              <td class="px-2 py-1"></td>
              <td class="px-2 py-1">{sub.category?.name ?? 'Sans sous-catégorie'}</td>
              <td class="num px-2 py-1 text-right">{sub.transactions.length}</td>
              <td class="num px-2 py-1 text-right">{sub.income > 0 ? money(sub.income) : ''}</td>
              <td class="num px-2 py-1 text-right">{sub.expense > 0 ? money(sub.expense) : ''}</td>
              <td class="num px-2 py-1 text-right text-muted">
                {sub.expense > 0 ? pct(share(sub.expense)) : ''}
              </td>
            </tr>
          {/each}
        {/each}
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-deep">
          <td class="px-2 py-2 font-bold" colspan="3">Total</td>
          <td class="num px-2 py-2 text-right font-bold">{money(summary.income)}</td>
          <td class="num px-2 py-2 text-right font-bold">{money(summary.expenses)}</td>
          <td class="num px-2 py-2 text-right font-bold">100%</td>
        </tr>
      </tfoot>
    </table>
  </section>

  <!-- --------------------------------------------------------- les lignes -->
  <section class="mt-5 break-before-page">
    <h2 class="m-0 mb-3 font-serif text-[17px] font-medium text-[#34433d]">
      Toutes les lignes <span class="text-[11px] font-normal text-muted">({data.transactions.length})</span>
    </h2>
    <table class="w-full border-collapse text-[10.5px]">
      <thead>
        <tr class="border-b border-line bg-[#fafbfa] text-left">
          <th class="px-2 py-1.5 font-semibold">Ligne</th>
          <th class="px-2 py-1.5 font-semibold">Sous-catégorie</th>
          <th class="px-2 py-1.5 font-semibold">Concerné</th>
          <th class="px-2 py-1.5 font-semibold">Fréquence</th>
          <th class="px-2 py-1.5 text-right font-semibold">Montant</th>
          <th class="px-2 py-1.5 text-right font-semibold">Par mois</th>
          {#each data.members as member (member.id)}
            <th class="px-2 py-1.5 text-right font-semibold">Part {member.display_name}</th>
          {/each}
          <th class="px-2 py-1.5 font-semibold">Compte</th>
        </tr>
      </thead>
      {#each blocks as { group, subs } (group.key)}
        <tbody class="sheet-block">
          <tr style="background: {tint(stripe(group.root?.color), 0.09)}">
            <td
              class="px-2 py-1.5 font-bold"
              colspan={6 + data.members.length}
              style="box-shadow: inset 3px 0 0 {stripe(group.root?.color)}"
            >
              {group.root?.name ?? 'Non classé'}
              <span class="ml-2 font-normal text-muted">
                {group.transactions.length} ligne{group.transactions.length > 1 ? 's' : ''} ·
                {money(group.expense)} / mois
              </span>
            </td>
          </tr>
          {#each subs as sub (sub.key)}
            {#each sub.transactions as tx (tx.id)}
              <tr class="border-b border-line">
                <td class="px-2 py-1">
                  {#if tx.kind === 'income'}<span class="text-deep">↑</span>{/if}
                  {tx.name || '—'}
                </td>
                <td class="px-2 py-1 text-muted">{sub.category?.name ?? '—'}</td>
                <td class="px-2 py-1">
                  {tx.member_id
                    ? (data.members.find((m) => m.id === tx.member_id)?.display_name ?? '—')
                    : 'Commun'}
                </td>
                <td class="px-2 py-1 text-muted">{tx.frequency === 'yearly' ? 'Annuel' : 'Mensuel'}</td>
                <td class="num px-2 py-1 text-right">{money(tx.amount)}</td>
                <td class="num px-2 py-1 text-right font-bold">{money(monthlyAmount(tx))}</td>
                {#each data.members as member (member.id)}
                  <td class="num px-2 py-1 text-right text-muted">
                    {money(shareOf(tx, member.id, data.members))}
                  </td>
                {/each}
                <td class="px-2 py-1 text-muted">{tx.account ?? '—'}</td>
              </tr>
            {/each}
          {/each}
        </tbody>
      {/each}
    </table>
  </section>

  <footer class="mt-5 border-t border-line pt-2.5 text-[9.5px] text-muted">
    Montants mensualisés : une ligne annuelle est divisée par douze avant toute répartition.
    Les parts par membre suivent la répartition définie sur chaque ligne.
  </footer>
</article>
</div>

<style>
  @media screen {
    .preview > .report {
      zoom: var(--preview-scale);
    }
  }
  /* Un bloc ne doit jamais être coupé en deux par un saut de page. */
  .report :global(.sheet-block),
  .report :global(tr) {
    break-inside: avoid;
  }

  @media screen {
    .report {
      box-shadow: 0 1px 3px rgba(28, 31, 29, 0.08);
      border: 1px solid var(--color-line);
      border-radius: var(--radius-card);
      padding: 26px;
      margin-bottom: 40px;
    }
  }

  /* À l'impression, les marges viennent de @page : le document les répéterait. */
  @media print {
    .report {
      padding: 0;
      border: 0;
      box-shadow: none;
    }
  }
</style>
