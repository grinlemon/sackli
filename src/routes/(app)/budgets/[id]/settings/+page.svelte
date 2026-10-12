<script lang="ts">
  import { enhance } from '$app/forms';
  import Field from '$lib/components/Field.svelte';
  import { COLOR_PRESETS } from '$lib/budget/colors';
  import {
    balancedCommonWeights,
    commonTotal,
    memberBreakdown,
    simulateCommonSplit
  } from '$lib/budget/calc';
  import { money, pct } from '$lib/format';
  import { categoryTree, memberStatus } from '$lib/types';

  let { data, form } = $props();

  const isOwner = $derived(data.budget.owner_id === data.user.id);
  let adding = $state(false);

  const tree = $derived(categoryTree(data.categories));
  let addingCategory = $state(false);
  /** id de la racine dont le champ « sous-catégorie » est ouvert. */
  let addingChildOf = $state<string | null>(null);

  const input =
    'w-full rounded-control border border-line bg-panel px-3 py-2 outline-none focus:border-green focus:ring-2 focus:ring-pale';

  // ------------------------------------------------ équilibrage du commun

  const common = $derived(commonTotal(data.transactions));

  /** La répartition réellement en vigueur, en % — le point de départ du curseur. */
  function currentParts(): Record<string, number> {
    const total = commonTotal(data.transactions);
    if (total <= 0 || data.members.length === 0) {
      return Object.fromEntries(data.members.map((m) => [m.id, 100 / data.members.length]));
    }
    return Object.fromEntries(
      data.members.map((m) => [
        m.id,
        (memberBreakdown(data.transactions, m, data.members).common / total) * 100
      ])
    );
  }

  /**
   * La répartition en base, recalculée quand les données changent : après
   * l'enregistrement, `parts` la rejoint et le bouton redevient inerte. Figée à
   * l'initialisation, elle laissait « Appliquer » actif sur un budget déjà à jour.
   */
  const initial = $derived(currentParts());
  /** Simulation seule : rien de tout ceci n'atteint la base avant « Appliquer ». */
  let parts = $state<Record<string, number>>(currentParts());

  const rows = $derived(
    simulateCommonSplit(data.transactions, data.members, new Map(Object.entries(parts)))
  );
  /** Écart entre le reste le plus haut et le plus bas — ce qu'on cherche à annuler. */
  const spread = $derived(
    rows.length < 2
      ? 0
      : Math.max(...rows.map((r) => r.remaining)) - Math.min(...rows.map((r) => r.remaining))
  );
  const dirty = $derived(
    data.members.some((m) => Math.abs((parts[m.id] ?? 0) - (initial[m.id] ?? 0)) > 0.005)
  );

  /**
   * Ce qui sera réellement écrit : la part normalisée de chaque membre, prise
   * sur la simulation elle-même. Ce qu'on voit est donc exactement ce qu'on
   * enregistre, même si les poids saisis ne totalisent pas 100.
   */
  const submitted = $derived(
    rows.map((r) => ({
      id: r.member.id,
      part: common > 0 ? (r.common / common) * 100 : 100 / Math.max(rows.length, 1)
    }))
  );

  function equalise() {
    const weights = balancedCommonWeights(data.transactions, data.members);
    parts = Object.fromEntries(data.members.map((m) => [m.id, weights.get(m.id) ?? 0]));
  }

  function setSlider(value: number) {
    const [a, b] = data.members;
    parts = { ...parts, [a.id]: value, [b.id]: 100 - value };
  }

  const sliderValue = $derived(Math.round(parts[data.members[0]?.id] ?? 50));

  const STATUS = {
    linked: { label: 'Rattaché', class: 'border-[#bcebd5] bg-pale text-deep' },
    invited: { label: 'Invité', class: 'border-line bg-bg text-muted' },
    offline: { label: 'Hors compte', class: 'border-line bg-bg text-muted' }
  } as const;
</script>

<section class="max-w-[720px] pt-7 pb-10 max-sm:pt-4">
  {#if form?.error}
    <p class="mb-4 rounded-control border border-[#f0d5d3] bg-[#fdf3f2] px-3 py-2.5 text-[12px] text-danger">{form.error}</p>
  {/if}
  {#if form?.ok}
    <p class="mb-4 rounded-control border border-[#bcebd5] bg-pale px-3 py-2.5 text-[12px] text-deep">{form.ok}</p>
  {/if}

  <div class="rounded-card border border-line bg-panel p-5 max-sm:p-4">
    <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">Nom du budget</h2>
    <form method="POST" action="?/rename" use:enhance class="mt-4 flex items-end gap-3 max-sm:flex-col max-sm:items-stretch">
      <div class="flex-1"><Field label="Nom" name="name" value={data.budget.name} required /></div>
      <button
        disabled={!isOwner}
        class="mb-4 rounded-control border border-line bg-panel px-3.5 py-2.5 font-medium hover:bg-bg disabled:opacity-50"
      >
        Renommer
      </button>
    </form>
  </div>

  <div class="mt-2.5 rounded-card border border-line bg-panel p-5 max-sm:p-4">
    <div class="flex items-center justify-between">
      <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">Membres</h2>
      {#if isOwner}
        <button
          class="rounded-control border border-line px-3 py-2 text-[12px] font-medium hover:bg-bg"
          onclick={() => (adding = !adding)}
        >
          {adding ? 'Annuler' : '＋ Ajouter'}
        </button>
      {/if}
    </div>

    <p class="mt-2 mb-4 text-[12px] text-muted">
      Un membre sans compte compte quand même dans les calculs. Renseignez son email pour qu'il
      retrouve ce budget à sa prochaine connexion — le rattachement se fait tout seul, une fois son
      adresse confirmée.
    </p>

    {#if adding}
      <form method="POST" action="?/addMember" use:enhance class="mb-4 rounded-control border border-line bg-bg p-4">
        <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Field label="Nom" name="display_name" required placeholder="Sam" />
          <Field label="Email (optionnel)" name="invite_email" type="email" placeholder="ilona@exemple.ch" />
        </div>
        <button class="rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96">
          Ajouter le membre
        </button>
      </form>
    {/if}

    <div class="border-t border-line">
      {#each data.members as member (member.id)}
        {@const status = STATUS[memberStatus(member)]}
        <form
          method="POST"
          action="?/updateMember"
          use:enhance
          class="flex items-end gap-3 border-b border-line py-4 last:border-b-0 max-sm:flex-col max-sm:items-stretch"
        >
          <input type="hidden" name="id" value={member.id} />
          <div class="flex-1"><Field label="Nom" name="display_name" value={member.display_name} required /></div>
          <div class="flex-1">
            <Field
              label="Email"
              name="invite_email"
              type="email"
              value={member.invite_email ?? ''}
              placeholder="—"
            />
          </div>
          <div class="mb-4 flex items-center gap-2">
            <span class="rounded border px-2 py-1 text-[10px] tracking-wide uppercase {status.class}">
              {status.label}
            </span>
            {#if isOwner}
              <button class="rounded-control border border-line px-3 py-2 text-[12px] hover:bg-bg">
                Enregistrer
              </button>
              {#if member.user_id !== data.user.id}
                <button
                  formaction="?/removeMember"
                  class="rounded-control px-2 py-2 text-[12px] text-muted hover:text-danger"
                  onclick={(e) => {
                    if (!confirm(`Retirer ${member.display_name} ? Ses lignes deviendront communes.`))
                      e.preventDefault();
                  }}
                >
                  Retirer
                </button>
              {/if}
            {/if}
          </div>
        </form>
      {/each}
    </div>
  </div>

  <!-- ------------------------------------- équilibrage des dépenses communes -->
  <div class="mt-2.5 rounded-card border border-line bg-panel p-5 max-sm:p-4">
    <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">
      Équilibrer les dépenses communes
    </h2>
    <p class="mt-2 mb-4 text-[12px] text-muted">
      Bougez le curseur pour voir, en direct, ce qu'il resterait à chacun une fois le commun et le
      personnel payés. <b>Rien n'est enregistré tant que vous n'appliquez pas</b> — et appliquer
      remplace la répartition de toutes les lignes communes, y compris celles réglées à la main.
    </p>

    {#if data.members.length < 2}
      <p class="rounded-control border border-line bg-bg px-3 py-2.5 text-[12px] text-muted">
        Il faut au moins deux membres pour répartir une dépense commune.
      </p>
    {:else if common <= 0}
      <p class="rounded-control border border-line bg-bg px-3 py-2.5 text-[12px] text-muted">
        Ce budget n'a aucune dépense commune. Une ligne devient commune quand sa colonne
        « Concerné » vaut <b>Commun</b>.
      </p>
    {:else}
      <div class="rounded-control border border-line bg-bg p-4">
        <div class="flex items-center justify-between text-[12px]">
          <span class="text-muted">À répartir</span>
          <b class="num">{money(common)} / mois</b>
        </div>

        {#if data.members.length === 2}
          <!-- Même geste que dans la grille : le curseur porte la part du membre #1. -->
          <div class="mt-3.5 flex items-center gap-3">
            <span class="w-[92px] shrink-0 truncate text-[12px] font-bold">
              {data.members[0].display_name}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              class="min-w-0 flex-1 accent-deep"
              value={sliderValue}
              aria-label="Part de {data.members[0].display_name} dans les dépenses communes"
              oninput={(e) => setSlider(Number(e.currentTarget.value))}
            />
            <span class="w-[92px] shrink-0 truncate text-right text-[12px] font-bold">
              {data.members[1].display_name}
            </span>
          </div>
          <div class="num mt-1 flex justify-between text-[11px] text-muted">
            <span>{pct(sliderValue)}</span>
            <span>{pct(100 - sliderValue)}</span>
          </div>
        {:else}
          <!-- Au-delà de deux membres, un curseur n'a plus de sens : un champ par part. -->
          <div class="mt-3.5 flex flex-wrap gap-3">
            {#each data.members as member (member.id)}
              <label class="flex items-center gap-1.5 text-[12px]">
                <span class="max-w-[110px] truncate">{member.display_name}</span>
                <input
                  type="number"
                  min="0"
                  class="num w-[62px] rounded border border-line bg-panel px-1.5 py-1 text-right outline-none focus:border-green"
                  value={Math.round(parts[member.id] ?? 0)}
                  onchange={(e) =>
                    (parts = { ...parts, [member.id]: Math.max(Number(e.currentTarget.value) || 0, 0) })}
                />
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <table class="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr class="border-b border-line text-left text-muted">
            <th class="py-1.5 font-semibold">Membre</th>
            <!-- Sur un téléphone, les colonnes que l'équilibrage ne bouge pas cèdent la
                 place : le détail complet est dans la vue Analyse. -->
            <th class="py-1.5 text-right font-semibold max-sm:hidden">Revenu</th>
            <th class="py-1.5 text-right font-semibold max-sm:hidden">Personnel</th>
            <th class="py-1.5 text-right font-semibold">Part du commun</th>
            <th class="py-1.5 text-right font-semibold">Reste</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.member.id)}
            <tr class="border-b border-line last:border-b-0">
              <td class="py-2">{row.member.display_name}</td>
              <td class="num py-2 text-right whitespace-nowrap max-sm:hidden">{money(row.income)}</td>
              <td class="num py-2 text-right whitespace-nowrap text-muted max-sm:hidden">−{money(row.personal)}</td>
              <td class="num py-2 text-right whitespace-nowrap text-muted">
                −{money(row.common)}
                <small class="ml-1 text-[10px]">
                  {pct(common > 0 ? (row.common / common) * 100 : 0)}
                </small>
              </td>
              <td class="num py-2 text-right font-serif text-[16px] font-medium whitespace-nowrap {row.remaining < 0
                ? 'text-danger'
                : 'text-deep'}">
                {money(row.remaining)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span
          class="rounded-control border px-3 py-2 text-[12px] {Math.round(spread) === 0
            ? 'border-[#bcebd5] bg-pale text-deep'
            : 'border-line bg-bg text-muted'}"
        >
          Écart entre les restes <b class="num ml-1">{money(spread)}</b>
        </span>

        <button
          type="button"
          class="rounded-control border border-line px-3.5 py-2.5 text-[12px] font-medium hover:bg-bg max-sm:min-h-[44px] max-sm:flex-1"
          onclick={equalise}
        >
          Égaliser les restes
        </button>

        <form method="POST" action="?/balanceCommon" use:enhance class="ml-auto flex items-center gap-3 max-sm:w-full">
          {#each submitted as part (part.id)}
            <input type="hidden" name="part_{part.id}" value={part.part} />
          {/each}
          <button
            disabled={!dirty}
            class="rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-40 max-sm:min-h-[44px] max-sm:w-full"
          >
            Appliquer à {data.transactions.filter((t) => t.kind === 'expense' && t.member_id === null).length} lignes
          </button>
        </form>
      </div>
    {/if}
  </div>

  <div class="mt-2.5 rounded-card border border-line bg-panel p-5 max-sm:p-4">
    <div class="flex items-center justify-between">
      <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">Catégories</h2>
      <button
        class="rounded-control border border-line px-3 py-2 text-[12px] font-medium hover:bg-bg"
        onclick={() => (addingCategory = !addingCategory)}
      >
        {addingCategory ? 'Annuler' : '＋ Ajouter'}
      </button>
    </div>

    <p class="mt-2 mb-4 text-[12px] text-muted">
      La couleur se règle sur la catégorie ; ses sous-catégories en reprennent la teinte, à une
      intensité près. C'est elle qui colore la ligne dans la grille. Supprimer une catégorie
      supprime ses sous-catégories et laisse les lignes concernées sans catégorie — leurs montants
      ne changent pas.
    </p>

    <!-- Les navigateurs proposent ces teintes en raccourci dans le sélecteur natif. -->
    <datalist id="category-colors">
      {#each COLOR_PRESETS as preset (preset)}<option value={preset}></option>{/each}
    </datalist>

    {#if addingCategory}
      <form
        method="POST"
        action="?/addCategory"
        use:enhance
        class="mb-4 flex items-center gap-2 rounded-control border border-line bg-bg p-4"
      >
        <input
          type="color"
          name="color"
          value="#6b716e"
          list="category-colors"
          aria-label="Couleur"
          class="h-[38px] w-[42px] shrink-0 cursor-pointer rounded-control border border-line bg-panel p-1"
        />
        <input name="name" required placeholder="Nom de la catégorie" aria-label="Nom" class={input} />
        <button class="shrink-0 rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96">
          Ajouter
        </button>
      </form>
    {/if}

    <div class="border-t border-line">
      {#each tree as { root, children } (root.id)}
        <div class="border-b border-line py-3 last:border-b-0">
          <form method="POST" action="?/updateCategory" use:enhance class="flex items-center gap-2">
            <input type="hidden" name="id" value={root.id} />
            <input
              type="color"
              name="color"
              value={root.color ?? '#6b716e'}
              list="category-colors"
              aria-label="Couleur de {root.name}"
              class="h-[38px] w-[42px] shrink-0 cursor-pointer rounded-control border border-line bg-panel p-1"
            />
            <input name="name" value={root.name} required aria-label="Nom" class={input} />
            <button class="shrink-0 rounded-control border border-line px-3 py-2 text-[12px] hover:bg-bg max-sm:h-10 max-sm:w-10 max-sm:p-0" aria-label="Enregistrer {root.name}">
              <span class="max-sm:hidden">Enregistrer</span><span class="text-[15px] sm:hidden" aria-hidden="true">✓</span>
            </button>
            <button
              formaction="?/removeCategory"
              class="shrink-0 rounded-control px-2 py-2 text-[12px] text-muted hover:text-danger max-sm:h-10 max-sm:w-9 max-sm:p-0"
              aria-label="Supprimer {root.name}"
              onclick={(e) => {
                const extra = children.length
                  ? ` et ses ${children.length} sous-catégorie${children.length > 1 ? 's' : ''}`
                  : '';
                if (!confirm(`Supprimer « ${root.name} »${extra} ?`)) e.preventDefault();
              }}
            >
              <span class="max-sm:hidden">Supprimer</span><span class="text-[15px] sm:hidden" aria-hidden="true">✕</span>
            </button>
          </form>

          <div class="mt-1 ml-[52px] max-sm:ml-3">
            {#each children as child (child.id)}
              <form
                method="POST"
                action="?/updateCategory"
                use:enhance
                class="mt-1.5 flex items-center gap-2"
              >
                <input type="hidden" name="id" value={child.id} />
                <span
                  class="h-[22px] w-[3px] shrink-0 rounded-full"
                  style="background-color: {root.color ?? '#6b716e'}"
                ></span>
                <input name="name" value={child.name} required aria-label="Nom" class={input} />
                <button class="shrink-0 rounded-control border border-line px-3 py-2 text-[12px] hover:bg-bg max-sm:h-10 max-sm:w-10 max-sm:p-0" aria-label="Enregistrer {child.name}">
                  <span class="max-sm:hidden">Enregistrer</span><span class="text-[15px] sm:hidden" aria-hidden="true">✓</span>
                </button>
                <button
                  formaction="?/removeCategory"
                  class="shrink-0 rounded-control px-2 py-2 text-[12px] text-muted hover:text-danger max-sm:h-10 max-sm:w-9 max-sm:p-0"
                  aria-label="Supprimer {child.name}"
                  onclick={(e) => {
                    if (!confirm(`Supprimer « ${child.name} » ?`)) e.preventDefault();
                  }}
                >
                  <span class="max-sm:hidden">Supprimer</span><span class="text-[15px] sm:hidden" aria-hidden="true">✕</span>
                </button>
              </form>
            {/each}

            {#if addingChildOf === root.id}
              <form
                method="POST"
                action="?/addCategory"
                use:enhance
                class="mt-1.5 flex items-center gap-2"
              >
                <input type="hidden" name="parent_id" value={root.id} />
                <span
                  class="h-[22px] w-[3px] shrink-0 rounded-full"
                  style="background-color: {root.color ?? '#6b716e'}"
                ></span>
                <input
                  name="name"
                  required
                  placeholder="Nom de la sous-catégorie"
                  aria-label="Nom de la sous-catégorie"
                  class={input}
                />
                <button class="shrink-0 rounded-control bg-green px-3.5 py-2 text-[12px] font-bold text-[#143b2b] hover:brightness-96">
                  Ajouter
                </button>
                <button
                  type="button"
                  class="shrink-0 rounded-control px-2 py-2 text-[12px] text-muted hover:bg-bg"
                  onclick={() => (addingChildOf = null)}
                >
                  Annuler
                </button>
              </form>
            {:else}
              <button
                class="mt-1.5 rounded-control px-1 py-1 text-[12px] text-muted hover:bg-bg max-sm:min-h-[40px] max-sm:px-2 max-sm:text-[13px]"
                onclick={() => (addingChildOf = root.id)}
              >
                ＋ Sous-catégorie
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if tree.length === 0}
        <p class="py-6 text-center text-[12px] text-muted">Aucune catégorie pour l'instant.</p>
      {/if}
    </div>
  </div>
</section>
