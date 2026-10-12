<script lang="ts">
  import { householdSummary, incomeFlow, memberBreakdown, memberFlow, shareOf } from '$lib/budget/calc';
  import { MEMBER_COLORS, MEMBER_DARK } from '$lib/budget/colors';
  import { buildSankey, type SankeyDetail } from '$lib/budget/sankey';
  import FlowBar from '$lib/components/FlowBar.svelte';
  import MetricCard from '$lib/components/MetricCard.svelte';
  import Sankey from '$lib/components/Sankey.svelte';
  import Waterfall from '$lib/components/Waterfall.svelte';
  import { money, pct } from '$lib/format';
  import type { BudgetCategory, BudgetMember, Transaction } from '$lib/types';

  /** La vue Analyse, sortie de sa route pour servir aussi la démo. */
  interface Props {
    data: { members: BudgetMember[]; categories: BudgetCategory[]; transactions: Transaction[] };
  }
  let { data }: Props = $props();


  const summary = $derived(householdSummary(data.transactions, data.members));
  const breakdowns = $derived(
    data.members.map((m) => memberBreakdown(data.transactions, m, data.members))
  );

  const commonTotal = $derived(
    data.transactions
      .filter((t) => t.kind === 'expense' && t.member_id === null)
      .reduce((a, t) => a + data.members.reduce((s, m) => s + shareOf(t, m.id, data.members), 0), 0)
  );

  const flow = $derived(incomeFlow(data.transactions, data.members));
  const memberFlows = $derived(
    data.members.map((m) => memberFlow(data.transactions, m, data.members))
  );

  // Une seule table de couleurs pour la barre du ménage et celles des membres :
  // un membre garde sa teinte d'une barre à l'autre, et « Commun » la sienne.
  const styles = $derived({
    common: { color: 'var(--color-seg-common)' },
    remaining: { color: 'var(--color-seg-rest)' },
    ...Object.fromEntries(
      data.members.map((m, i) => [
        `member:${m.id}`,
        { color: MEMBER_COLORS[i % MEMBER_COLORS.length], dark: MEMBER_DARK[i % MEMBER_DARK.length] }
      ])
    )
  });
  /** Dans la barre d'un membre, « Personnel » porte la teinte de ce membre. */
  const memberStyles = $derived(
    data.members.map((m, i) => ({
      ...styles,
      personal: {
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        dark: MEMBER_DARK[i % MEMBER_DARK.length]
      }
    }))
  );

  let detail = $state<SankeyDetail>('lines');

  /**
   * Trois colonnes demandent 700px : sur un téléphone, le diagramme défilerait
   * de côté et on n'en verrait jamais qu'un tiers. Les deux premières tiennent
   * à la largeur de l'écran — on part donc de là, et le détail reste à un toucher.
   */
  const NARROW = '(max-width: 639.98px)';
  let narrow = $state(false);
  $effect(() => {
    const query = matchMedia(NARROW);
    narrow = query.matches;
    if (narrow) detail = 'roots';
    const sync = () => (narrow = query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });
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
</script>

<section class="pt-7 max-sm:pt-4">
  <div class="flex items-end justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
    <div class="max-sm:hidden">
      <p class="m-0 mb-1.5 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">Vue d'ensemble</p>
      <p class="m-0 font-serif text-[16px] text-[#4e5752]">Le scénario prévu du mois, en un coup d'œil.</p>
    </div>
    <div class="rounded-card border border-line bg-panel px-4 py-2.5 text-right">
      <small class="block text-[10px] text-muted">Revenus planifiés</small>
      <b class="num font-serif text-[20px] font-medium text-[#34433d]">{money(summary.income)}</b>
    </div>
  </div>

  <div class="mt-6 grid grid-cols-4 gap-2.5 max-lg:grid-cols-2 max-sm:gap-2">
    <MetricCard label="Sorties communes" value={money(commonTotal)} hint="à répartir entre membres" />
    {#each breakdowns.slice(0, 2) as b (b.member.id)}
      <MetricCard
        label="Reste {b.member.display_name}"
        value={money(b.remaining)}
        hint="après commun + perso"
        highlight
      />
    {/each}
    <MetricCard label="Reste ménage" value={money(summary.remaining)} hint="marge prévisionnelle totale" />
  </div>

  <div class="mt-2.5 rounded-card border border-line bg-panel p-5 max-sm:p-4">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">Où va l'argent</h2>
        <p class="mt-1.5 mb-0 text-[11px] text-muted">
          Des revenus à chaque ligne, épaisseur proportionnelle au montant mensuel. Touchez un élément pour isoler son chemin.
        </p>
      </div>
      <!-- Descendre jusqu'aux lignes donne une colonne par prévision : utile pour
           un budget tenu à la ligne, illisible pour en saisir la forme. D'où le choix. -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex overflow-hidden rounded-control border border-line">
          {#each UNITS as u (u.key)}
            <button
              class="border-0 px-2.5 py-1.5 text-[11.5px] max-sm:min-h-[40px] max-sm:px-3.5 max-sm:text-[13px] {unit === u.key
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
              class="border-0 px-2.5 py-1.5 text-[11.5px] max-sm:min-h-[40px] max-sm:px-3 max-sm:text-[13px] {detail === step.key
                ? 'bg-pale font-bold text-deep'
                : 'bg-panel text-muted hover:bg-bg'}"
              onclick={() => (detail = step.key)}
            >
              {step.label}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="mt-4">
      <Sankey {graph} {unit} floor={narrow && detail === 'roots' ? 300 : 700} />
    </div>
  </div>

  <div class="mt-2.5 rounded-card border border-line bg-panel p-5 max-sm:p-4">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">Répartition du revenu</h2>
        <p class="mt-1.5 mb-0 text-[11px] text-muted">
          Ce que le ménage gagne, et ce qu'il en fait.
        </p>
      </div>
      <span class="num text-[11px] text-muted">
        Revenus <b class="ml-1 text-fg">{money(flow.income)}</b>
      </span>
    </div>

    <div class="mt-4">
      <FlowBar segments={flow.segments} {styles} />
    </div>

    {#if flow.overrun > 0}
      <!-- Sans ça, la barre pleine se lirait comme un budget à l'équilibre. -->
      <p class="mt-2.5 rounded-control border border-[#f0d5d3] bg-[#fdf3f2] px-3 py-2 text-[11.5px] text-danger">
        Les dépenses dépassent les revenus de <b class="num">{money(flow.overrun)}</b> par mois :
        la barre montre les dépenses, pas le revenu.
      </p>
    {/if}

    <!-- La même barre, mais à l'échelle du revenu de chacun. Deux membres aux
         revenus différents supportent le même montant commun sans fournir le
         même effort — c'est ce que la barre du ménage ne peut pas montrer. -->
    <h3 class="mt-6 mb-0 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">
      Effort de chacun, sur son propre revenu
    </h3>

    {#each memberFlows as member, i (member.member.id)}
      <div class="mt-3.5 flex items-center gap-3.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5">
        <span class="flex w-[104px] shrink-0 items-center gap-2 text-[12.5px]">
          <i class="h-2 w-2 shrink-0 rounded-full" style="background:{MEMBER_COLORS[i % MEMBER_COLORS.length]}"></i>
          <b class="truncate">{member.member.display_name}</b>
        </span>

        <div class="min-w-0 flex-1">
          <FlowBar segments={member.segments} styles={memberStyles[i]} height={28} />
        </div>

        <!-- Deux lignes explicites : sur une seule, « CHF » se retrouvait seul
             en bout de ligne dès que le prénom ou le montant s'allongeait. -->
        <span class="w-[150px] shrink-0 text-right text-[11.5px] leading-tight text-muted max-sm:w-auto max-sm:text-left">
          <span class="num block whitespace-nowrap">{pct(member.used)} de son revenu</span>
          <span class="num block whitespace-nowrap">
            reste
            <b class={member.remaining < 0 ? 'text-danger' : 'text-deep'}>
              {money(member.remaining)}
            </b>
          </span>
        </span>
      </div>
    {/each}
  </div>

  <div class="mt-2.5 grid grid-cols-2 gap-2.5 pb-10 max-lg:grid-cols-1">
    {#each breakdowns as b, i (b.member.id)}
      <Waterfall breakdown={b} color={MEMBER_COLORS[i % MEMBER_COLORS.length]} />
    {/each}
  </div>
</section>
