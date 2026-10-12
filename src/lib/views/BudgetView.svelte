<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { monthlyAmount } from '$lib/budget/calc';
  import {
    DEFAULT_SORT,
    EMPTY_FILTERS,
    accountsOf,
    groupByCategory,
    isFiltering,
    matches,
    viewTransactions,
    type CategoryGroup,
    type Sort,
    type SortKey,
    type TxFilters
  } from '$lib/budget/filters';
  import { groupAccent } from '$lib/budget/colors';
  import { BudgetState } from '$lib/budget/state.svelte';
  import { GRID_COLS, GRID_MIN_W } from '$lib/budget/ui';
  import Chevron from '$lib/components/Chevron.svelte';
  import TransactionCard from '$lib/components/TransactionCard.svelte';
  import TransactionRow from '$lib/components/TransactionRow.svelte';
  import TransactionSheet from '$lib/components/TransactionSheet.svelte';
  import { money } from '$lib/format';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { categoryTree, type BudgetCategory, type BudgetMember, type Transaction, type TxKind } from '$lib/types';

  /**
   * L'écran « Budget » : la grille, ses filtres, ses cartes mobiles. Sorti de
   * sa route pour servir aussi la démo, qui lui passe son propre `sheet` —
   * un état en mémoire partagé avec les autres vues de la démo.
   */
  interface Props {
    data: {
      /** null : rien n'est écrit (démo). */
      supabase: SupabaseClient | null;
      budget: { id: string };
      members: BudgetMember[];
      categories: BudgetCategory[];
      transactions: Transaction[];
      /** État fourni de l'extérieur ; sinon la vue construit le sien depuis `transactions`. */
      sheet?: BudgetState;
    };
  }
  let { data }: Props = $props();

  const sheet = $derived(
    data.sheet ?? new BudgetState(data.supabase, data.budget.id, data.transactions, data.members)
  );

  let filters = $state<TxFilters>({ ...EMPTY_FILTERS });
  let sort = $state<Sort>({ ...DEFAULT_SORT });
  let grouping = $state(true);
  /** Racines repliées — `''` est la clé du groupe « Non classé ». */
  let collapsed = $state(new Set<string>());

  /**
   * Sous `lg`, la grille (1060px de plancher) laisse place à des cartes, et
   * l'édition passe par une fiche : l'id de la ligne ouverte. On garde l'id et
   * non l'objet, pour que la fiche suive la ligne si `sheet` se reconstruit.
   */
  let openId = $state<string | null>(null);
  const openTx = $derived(sheet.transactions.find((t) => t.id === openId) ?? null);
  /** Les filtres replient sous `lg` : sur un téléphone, ils prendraient l'écran entier. */
  let filtersOpen = $state(false);
  const activeFilters = $derived(
    [
      filters.categoryId !== 'all',
      filters.memberId !== 'all',
      filters.frequency !== 'all',
      filters.account !== 'all',
      filters.min !== null,
      filters.max !== null
    ].filter(Boolean).length
  );

  const ctx = $derived({ members: data.members, categories: data.categories });
  const tree = $derived(categoryTree(data.categories));
  // Le compte filtré reste dans la liste même si la dernière ligne qui le
  // portait vient d'être renommée : sinon le select se viderait sous le doigt.
  const accounts = $derived.by(() => {
    const list = accountsOf(sheet.transactions);
    const picked = filters.account;
    if (picked !== 'all' && picked !== 'none' && !list.includes(picked)) list.push(picked);
    return list;
  });

  const visible = $derived(viewTransactions(sheet.transactions, filters, sort, ctx));
  // Le groupement se pose *au-dessus* du tri : les lignes arrivent déjà triées,
  // le groupe ne fait que les répartir sans toucher à leur ordre.
  const groups = $derived(groupByCategory(visible, data.categories));
  const filtering = $derived(isFiltering(filters));

  // Les compteurs d'onglets tiennent compte des autres filtres : un onglet
  // n'annonce jamais des lignes que la vue ne montrerait pas.
  const counts = $derived.by(() => {
    const rest = { ...filters, kind: 'all' as const };
    const pool = sheet.transactions.filter((t) => matches(t, rest, data.categories));
    return {
      all: pool.length,
      income: pool.filter((t) => t.kind === 'income').length,
      expense: pool.filter((t) => t.kind === 'expense').length
    };
  });

  /** Totaux de la vue courante — ce qui est affiché est ce qui est additionné. */
  const totals = $derived.by(() => {
    let income = 0;
    let expense = 0;
    for (const tx of visible) {
      if (tx.kind === 'income') income += monthlyAmount(tx);
      else expense += monthlyAmount(tx);
    }
    return { income, expense };
  });

  const allExpenses = $derived(
    sheet.transactions.filter((t) => t.kind === 'expense').reduce((a, t) => a + monthlyAmount(t), 0)
  );

  /** Croissant → décroissant → retour au tri par défaut : trois clics, pas de piège. */
  function toggleSort(key: SortKey) {
    if (sort.key !== key) sort = { key, dir: 'asc' };
    else if (sort.dir === 'asc') sort = { key, dir: 'desc' };
    else sort = { ...DEFAULT_SORT };
  }

  function reset() {
    filters = { ...EMPTY_FILTERS };
    sort = { ...DEFAULT_SORT };
    collapsed = new Set();
  }

  function toggleGroup(key: string) {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    collapsed = next;
  }

  function bound(value: string): number | null {
    return value.trim() === '' ? null : Number(value);
  }

  /**
   * Une ligne ajoutée hors de la vue courante serait invisible : plutôt que de
   * laisser croire que l'ajout a échoué, on rouvre la vue.
   */
  async function add() {
    const id = await sheet.add();
    if (!id) return;
    const tx = sheet.transactions.find((t) => t.id === id);
    if (!tx) return;
    if (!matches(tx, filters, data.categories)) filters = { ...EMPTY_FILTERS };
    // Une ligne ajoutée dans un groupe replié serait invisible elle aussi.
    if (collapsed.has('')) toggleGroup('');
    // Sans grille à portée de doigt, une ligne vide n'est utile qu'ouverte.
    if (matchMedia('(max-width: 1023.98px)').matches) openId = id;
  }

  /** Le tri des cartes, faute d'en-têtes à cliquer : clé et sens dans une seule valeur. */
  const SORTS: { value: string; label: string }[] = [
    { value: 'default:asc', label: 'Catégorie, puis montant' },
    { value: 'position:asc', label: 'Ordre de saisie' },
    { value: 'monthly:desc', label: 'Montant / mois, du plus gros' },
    { value: 'monthly:asc', label: 'Montant / mois, du plus petit' },
    { value: 'name:asc', label: 'Nom, A → Z' },
    { value: 'member:asc', label: 'Personne concernée' }
  ];
  const sortValue = $derived(sort.key === DEFAULT_SORT.key ? SORTS[0].value : `${sort.key}:${sort.dir}`);
  function setSort(value: string) {
    const [key, dir] = value.split(':') as [SortKey, 'asc' | 'desc'];
    sort = key === DEFAULT_SORT.key ? { ...DEFAULT_SORT } : { key, dir };
  }

  // Ne jamais quitter la page en laissant une frappe non écrite.
  beforeNavigate(() => sheet.flush());

  const tabs = [
    { key: 'all' as const, label: 'Toutes' },
    { key: 'income' as const, label: 'Revenus' },
    { key: 'expense' as const, label: 'Sorties' }
  ] satisfies { key: 'all' | TxKind; label: string }[];

  const control =
    'rounded-control border border-line bg-panel px-2 py-1.5 text-[12px] text-fg outline-none focus:border-green focus:ring-2 focus:ring-pale';

  /** Décalage d'une sous-catégorie dans une liste plate : insécables, qu'un
      `<option>` conserve là où il écraserait des espaces ordinaires. */
  const INDENT = '\u00a0\u00a0\u203a\u00a0';
</script>

{#snippet head(key: SortKey, label: string, right = false)}
  <button
    class="flex min-w-0 items-center gap-1 rounded border-0 bg-transparent px-1 py-0.5 font-semibold hover:text-deep {right
      ? 'justify-end'
      : ''}"
    aria-label="Trier par {label}"
    onclick={() => toggleSort(key)}
  >
    <span class="truncate">{label}</span>
    <span class="shrink-0 text-[9px] {sort.key === key ? 'text-deep' : 'text-[#c2cac6]'}">
      {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  </button>
{/snippet}

<!-- En-tête de groupe : la catégorie racine, son poids, et de quoi la replier.
     Il reprend le liseré et la teinte des lignes qu'il coiffe, en plus dense. -->
{#snippet groupHead(group: CategoryGroup, wide: boolean)}
  {@const accent = groupAccent(group.root)}
  {@const shut = collapsed.has(group.key)}
  <button
    class="{wide ? GRID_MIN_W : 'min-h-[44px]'} flex w-full items-center gap-2.5 border-0 border-t border-l-[3px] border-line px-3.5 py-2 text-left"
    style="border-left-color: {accent.stripe}; background-color: {accent.background}"
    aria-expanded={!shut}
    onclick={() => toggleGroup(group.key)}
  >
    <span class="text-muted"><Chevron collapsible open={!shut} size={13} /></span>
    <b class="text-[13px] text-[#1e2924]">{group.root?.name ?? 'Non classé'}</b>
    <small class="rounded bg-panel/70 px-1.5 py-0.5 text-[11px] text-muted">
      {group.transactions.length}
    </small>
    <span class="num ml-auto flex items-center gap-4 text-[12px]">
      {#if group.income > 0}
        <span class="text-deep">+{money(group.income)}</span>
      {/if}
      {#if group.expense > 0 || group.income === 0}
        <span>{money(group.expense)}</span>
      {/if}
    </span>
  </button>
{/snippet}

<svelte:window onbeforeunload={() => sheet.flush()} />

<TransactionSheet
  tx={openTx}
  members={data.members}
  categories={data.categories}
  {sheet}
  onclose={() => (openId = null)}
/>

<section class="pt-7 max-sm:pt-4">
  <div class="flex items-end justify-between gap-4 max-sm:flex-col max-sm:items-start">
    <div class="max-sm:hidden">
      <p class="m-0 mb-1.5 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">Prévisionnel</p>
      <p class="m-0 font-serif text-[16px] text-[#4e5752]">
        Planifiez les sorties du mois avant qu'elles arrivent.
      </p>
    </div>
    <button
      class="rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96 max-lg:hidden"
      onclick={add}
    >
      ＋ Nouvelle ligne
    </button>
  </div>

  <!-- Sous `lg`, les totaux d'abord : c'est ce qu'on vient lire sur un téléphone.
       Ceux de la vue affichée, comme le pied de la grille. -->
  <div class="mt-4 lg:hidden max-sm:mt-0">
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-card border border-line bg-panel px-3.5 py-2.5">
        <small class="block text-[11px] text-muted">Entrées / mois</small>
        <b class="num font-serif text-[19px] font-medium text-deep">{money(totals.income)}</b>
      </div>
      <div class="rounded-card border border-line bg-panel px-3.5 py-2.5">
        <small class="block text-[11px] text-muted">Sorties / mois</small>
        <b class="num font-serif text-[19px] font-medium text-[#34433d]">{money(totals.expense)}</b>
      </div>
    </div>
    {#if filtering}
      <p class="mt-2 mb-0 text-[12px] text-muted">
        {visible.length} ligne{visible.length > 1 ? 's' : ''} sur {sheet.transactions.length}, totaux de la vue filtrée.
      </p>
    {/if}

  </div>

  <!-- Bouton flottant au-dessus des onglets du bas, à portée du pouce. -->
  <button
    class="fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 grid h-14 w-14 place-items-center rounded-full bg-green text-[26px] font-bold text-[#143b2b] shadow-[0_4px_14px_rgb(22_115_78/0.35)] active:scale-95 sm:bottom-6 lg:hidden"
    aria-label="Nouvelle ligne"
    onclick={add}
  >
    ＋
  </button>

  {#if sheet.error}
    <p class="mt-4 rounded-control border border-[#f0d5d3] bg-[#fdf3f2] px-3 py-2.5 text-[12px] text-danger">
      {sheet.error}
    </p>
  {/if}

  <div class="mt-7 flex gap-6 border-b border-line max-sm:mt-5 max-sm:gap-0">
    {#each tabs as tab (tab.key)}
      <button
        class="border-0 border-b-2 bg-transparent py-2.5 max-sm:min-h-[44px] max-sm:flex-1 max-sm:text-[14px] {filters.kind === tab.key
          ? 'border-b-deep font-bold text-[#1e2924]'
          : 'border-b-transparent text-muted'}"
        onclick={() => (filters.kind = tab.key)}
      >
        {tab.label}
        <small class="ml-1.5 rounded bg-bg px-1.5 py-0.5 text-muted">{counts[tab.key]}</small>
      </button>
    {/each}
  </div>

  <!-- Barre de filtres : tout ce qui restreint la vue au même endroit, au-dessus
       de la grille, pour qu'on sache toujours ce qu'on est en train de regarder. -->
  <!-- Sous `lg`, seule la recherche reste visible ; le reste se déplie à la
       demande, et le bouton compte les filtres actifs pour qu'un filtre replié
       ne fasse pas croire à des lignes disparues. -->
  <div class="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-line bg-panel p-3">
    <div class="flex w-full gap-2 lg:contents">
      <input
        class="{control} min-w-0 flex-1 lg:min-w-[180px]"
        type="search"
        enterkeyhint="search"
        placeholder="Rechercher…"
        bind:value={filters.search}
      />
      <button
        class="shrink-0 rounded-control border px-3 text-[13px] lg:hidden {activeFilters || filtersOpen
          ? 'border-[#bcebd5] bg-pale font-bold text-deep'
          : 'border-line text-muted'}"
        aria-expanded={filtersOpen}
        onclick={() => (filtersOpen = !filtersOpen)}
      >
        Filtres{activeFilters ? ` · ${activeFilters}` : ''}
      </button>
    </div>

    <div class="grid w-full grid-cols-2 gap-2 lg:contents {filtersOpen ? '' : 'max-lg:hidden'}">
    <select class="{control} col-span-2 lg:hidden" value={sortValue} onchange={(e) => setSort(e.currentTarget.value)} aria-label="Trier">
      {#each SORTS as option (option.value)}
        <option value={option.value}>Tri : {option.label}</option>
      {/each}
    </select>

    <!-- Pas d'optgroup ici : son libellé répétait le nom de la racine en gras et
         non cliquable, juste au-dessus de la même racine en option. On cliquait
         le gras, il ne se passait rien. La hiérarchie passe par l'indentation,
         et tout ce qui est affiché est sélectionnable. Choisir une racine
         retient aussi ses sous-catégories (voir `matches`). -->
    <select class={control} bind:value={filters.categoryId} aria-label="Filtrer par catégorie">
      <option value="all">Toutes les catégories</option>
      <option value="none">Non classé</option>
      {#each tree as { root, children } (root.id)}
        <option value={root.id}>{root.name}</option>
        {#each children as child (child.id)}
          <option value={child.id}>{INDENT}{child.name}</option>
        {/each}
      {/each}
    </select>

    <select class={control} bind:value={filters.memberId} aria-label="Filtrer par personne concernée">
      <option value="all">Tout le monde</option>
      <option value="common">Commun</option>
      {#each data.members as member (member.id)}
        <option value={member.id}>{member.display_name}</option>
      {/each}
    </select>

    <select class={control} bind:value={filters.frequency} aria-label="Filtrer par fréquence">
      <option value="all">Toutes fréquences</option>
      <option value="monthly">Mensuel</option>
      <option value="yearly">Annuel</option>
    </select>

    <select class={control} bind:value={filters.account} aria-label="Filtrer par compte">
      <option value="all">Tous les comptes</option>
      <option value="none">Sans compte</option>
      {#each accounts as account (account)}
        <option value={account}>{account}</option>
      {/each}
    </select>

    <!-- Les bornes portent sur le montant mensualisé : sans quoi un annuel et un
         mensuel ne seraient pas comparables dans le même filtre. -->
    <div class="col-span-2 flex items-center gap-1 text-[12px] text-muted">
      <span class="whitespace-nowrap">/ mois</span>
      <input
        class="{control} num w-[74px] text-right max-lg:flex-1"
        type="number"
        inputmode="numeric"
        step="1"
        placeholder="min"
        aria-label="Montant mensuel minimum"
        value={filters.min ?? ''}
        oninput={(e) => (filters.min = bound(e.currentTarget.value))}
      />
      <span>–</span>
      <input
        class="{control} num w-[74px] text-right max-lg:flex-1"
        type="number"
        inputmode="numeric"
        step="1"
        placeholder="max"
        aria-label="Montant mensuel maximum"
        value={filters.max ?? ''}
        oninput={(e) => (filters.max = bound(e.currentTarget.value))}
      />
    </div>

    <label
      class="col-span-2 flex cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-[12px] text-muted select-none max-lg:min-h-[44px]"
    >
      <input type="checkbox" class="accent-deep" bind:checked={grouping} />
      Grouper par catégorie
    </label>

    {#if filtering || sort.key !== DEFAULT_SORT.key}
      <button
        class="col-span-2 rounded-control border border-line px-2.5 py-1.5 text-[12px] text-muted hover:bg-bg hover:text-fg max-lg:min-h-[44px]"
        onclick={reset}
      >
        Réinitialiser
      </button>
    {/if}
    </div>
  </div>

  {#if sort.key !== DEFAULT_SORT.key}
    <p class="mt-2 text-[11px] text-muted max-lg:hidden">
      Vue triée : le tri par défaut (catégorie, puis montant / mois croissant) revient en cliquant
      une troisième fois sur l'en-tête.
    </p>
  {/if}

  <!-- Sous `lg` : des cartes en lecture, une fiche pour éditer. Mêmes lignes,
       même groupement, même tri — seule la forme change. -->
  <div class="mt-4 mb-20 lg:hidden">
    <div class="overflow-hidden rounded-card border border-line bg-panel [&>*:first-child]:border-t-0">
      {#if grouping}
        {#each groups as group (group.key)}
          {@render groupHead(group, false)}
          {#if !collapsed.has(group.key)}
            {#each group.transactions as tx (tx.id)}
              <TransactionCard
                {tx}
                members={data.members}
                categories={data.categories}
                grouped
                onopen={() => (openId = tx.id)}
              />
            {/each}
          {/if}
        {/each}
      {:else}
        {#each visible as tx (tx.id)}
          <TransactionCard
            {tx}
            members={data.members}
            categories={data.categories}
            onopen={() => (openId = tx.id)}
          />
        {/each}
      {/if}

      {#if visible.length === 0}
        <p class="px-3.5 py-8 text-center text-[13px] text-muted">
          {filtering ? 'Aucune ligne ne correspond à ces filtres.' : 'Aucune ligne dans cette vue.'}
        </p>
      {/if}

      <button
        class="min-h-[48px] w-full border-0 border-t border-line bg-panel px-3.5 text-left text-[14px] text-muted"
        onclick={add}
      >
        ＋ Ajouter une prévision
      </button>
    </div>
  </div>

  <div class="mt-4 overflow-x-auto rounded-card border border-line bg-panel max-lg:hidden">
    <!-- L'en-tête reprend la taille et la couleur des cellules ; seule la graisse
         et le fond le distinguent, pour ne pas casser l'alignement de lecture. -->
    <div class="{GRID_COLS} border-l-[3px] border-l-transparent bg-[#fafbfa] px-3.5 py-2.5 font-semibold">
      {@render head('kind', 'Type')}
      {@render head('name', 'Nom')}
      {@render head('amount', 'Montant', true)}
      {@render head('category', 'Catégorie')}
      {@render head('frequency', 'Fréquence')}
      {@render head('member', 'Concerné')}
      <span class="truncate px-1">Répartition</span>
      {@render head('monthly', 'par mois', true)}
      {@render head('account', 'Compte')}
      <span></span>
    </div>

    {#if grouping}
      {#each groups as group (group.key)}
        {@render groupHead(group, true)}
        {#if !collapsed.has(group.key)}
          {#each group.transactions as tx (tx.id)}
            <TransactionRow
              {tx}
              members={data.members}
              categories={data.categories}
              {sheet}
              grouped
              root={group.root}
            />
          {/each}
        {/if}
      {/each}
    {:else}
      {#each visible as tx (tx.id)}
        <TransactionRow {tx} members={data.members} categories={data.categories} {sheet} />
      {/each}
    {/if}

    {#if visible.length === 0}
      <p class="border-t border-l-[3px] border-line border-l-transparent px-3.5 py-8 text-center text-[12px] text-muted">
        {#if filtering}
          Aucune ligne ne correspond à ces filtres.
        {:else}
          Aucune ligne dans cette vue.
        {/if}
      </p>
    {/if}

    <button
      class="w-full border-0 border-t border-l-[3px] border-line border-l-transparent bg-panel px-3.5 py-3 text-left text-muted hover:bg-bg"
      onclick={add}
    >
      ＋ Ajouter une prévision
    </button>

    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-l-[3px] border-line border-l-transparent bg-[#fafbfa] p-3.5">
      <span class="text-muted">
        {visible.length} ligne{visible.length > 1 ? 's' : ''}
        {#if filtering}<span class="text-[11px]">sur {sheet.transactions.length}</span>{/if}
      </span>
      <span class="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span>Entrées <b class="num ml-1.5">{money(totals.income)}</b></span>
        <span>
          Total sorties prévues / mois
          <b class="num ml-1.5">{money(totals.expense)}</b>
          {#if filtering}
            <small class="ml-1.5 text-[11px] text-muted">sur {money(allExpenses)} au total</small>
          {/if}
        </span>
      </span>
    </div>
  </div>
</section>
