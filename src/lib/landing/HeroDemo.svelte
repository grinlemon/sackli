<script lang="ts">
  import { incomeFlow, memberBreakdown, monthlyAmount, shareOf } from '$lib/budget/calc';
  import { rowAccent } from '$lib/budget/colors';
  import FlowBar from '$lib/components/FlowBar.svelte';
  import Counter from './Counter.svelte';
  import { money } from '$lib/format';
  import { DEMO_CATEGORIES, demoHousehold, type HouseholdSize } from './demo';

  /**
   * Un morceau de budget, jouable : on choisit la taille du foyer, on change un
   * montant, et la barre comme les restes suivent, par les mêmes fonctions que
   * l'app. Chaque foyer garde ses modifications quand on passe de l'un à l'autre.
   */
  const households = $state({ 1: demoHousehold(1), 2: demoHousehold(2), 3: demoHousehold(3) });
  let size = $state<HouseholdSize>(2);

  const SIZES: { key: HouseholdSize; label: string }[] = [
    { key: 1, label: 'Seul' },
    { key: 2, label: 'À deux' },
    // Trois membres dans la démo, mais l'app n'a pas de limite : le libellé ne doit pas en suggérer une.
    { key: 3, label: 'À plusieurs' }
  ];

  const current = $derived(households[size]);
  const members = $derived(current.members);
  const rows = $derived(
    current.transactions.filter((t) => ['Loyer', 'Courses', 'Vacances'].includes(t.name))
  );

  const flow = $derived(incomeFlow(current.transactions, members));
  const restes = $derived(members.map((m) => memberBreakdown(current.transactions, m, members)));

  const COLORS = ['var(--color-member-a)', 'var(--color-member-b)', '#6f8f83'];
  const DARK = [true, false, true];
  const styles = $derived({
    common: { color: 'var(--color-seg-common)' },
    remaining: { color: 'var(--color-seg-rest)' },
    ...Object.fromEntries(members.map((m, i) => [`member:${m.id}`, { color: COLORS[i], dark: DARK[i] }]))
  });
  // Seul, « Commun » ne veut rien dire : ce sont simplement les dépenses.
  const segments = $derived(
    size === 1 ? flow.segments.map((s) => (s.key === 'common' ? { ...s, label: 'Dépenses' } : s)) : flow.segments
  );
</script>

<div class="overflow-hidden rounded-[10px] border border-line bg-panel shadow-[0_24px_48px_-28px_rgba(22,115,78,0.3)] transition-shadow duration-500 hover:shadow-[0_32px_64px_-28px_rgba(22,115,78,0.45)]">
  <div class="flex items-center gap-3 border-b border-line px-4 py-3 max-sm:flex-wrap">
    <!-- Pastille qui pulse : la carte se manipule, ce n'est pas une capture. -->
    <span class="relative flex h-[7px] w-[7px]">
      <span class="absolute inset-0 animate-ping rounded-full bg-green opacity-60"></span>
      <span class="relative h-[7px] w-[7px] rounded-full bg-green"></span>
    </span>
    <span class="text-[12px] text-[#3d4541]">Essayez</span>
    <div class="ml-auto flex overflow-hidden rounded-control border border-line" role="group" aria-label="Taille du foyer">
      {#each SIZES as s (s.key)}
        <button
          class="border-0 px-3 py-1.5 text-[12px] transition-colors active:bg-pale max-sm:min-h-[40px] {size === s.key
            ? 'bg-pale font-bold text-deep'
            : 'bg-panel text-muted hover:bg-bg'}"
          aria-pressed={size === s.key}
          onclick={() => (size = s.key)}
        >
          {s.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="divide-y divide-line">
    {#each rows as tx (tx.id)}
      {@const accent = rowAccent(tx.category_id, DEMO_CATEGORIES)}
      {@const monthly = monthlyAmount(tx)}
      <div
        class="flex items-center gap-3 border-l-[3px] px-4 py-2.5"
        style="border-left-color: {accent?.stripe}; background: {accent?.background}"
      >
        <div class="min-w-0 flex-1">
          <b class="block truncate text-[13px] font-medium">{tx.name}</b>
          <small class="num block truncate text-[11px] text-muted">
            {[
              tx.frequency === 'yearly' ? `${money(monthly)} / mois` : null,
              members.length > 1 ? `${money(shareOf(tx, members[0].id, members))} chacun` : null
            ]
              .filter(Boolean)
              .join(' · ') || ' '}
          </small>
        </div>
        <label class="flex shrink-0 items-center gap-1.5">
          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="10"
            aria-label="Montant {tx.name}"
            class="num w-[82px] rounded-control border border-line bg-panel px-2 py-1 text-right outline-none focus:border-green"
            value={tx.amount}
            oninput={(e) => (tx.amount = Math.max(0, Number(e.currentTarget.value) || 0))}
          />
          <span class="w-[38px] text-[11px] whitespace-nowrap text-muted">{tx.frequency === 'yearly' ? '/ an' : '/ mois'}</span>
        </label>
      </div>
    {/each}
  </div>

  <div class="border-t border-line px-4 pt-3.5 pb-4">
    <div class="mb-2 flex items-baseline justify-between text-[11px] text-muted">
      <span>Répartition du revenu</span>
      <span class="num">Revenus <b class="text-fg"><Counter value={flow.income} /></b> / mois</span>
    </div>
    <FlowBar {segments} {styles} height={30} />
    <div class="mt-3 grid gap-2" style="grid-template-columns: repeat({members.length}, minmax(0, 1fr))">
      {#each restes as b, i (b.member.id)}
        <div class="min-w-0 rounded-card bg-pale px-3 py-2">
          <span class="flex items-center gap-1.5 truncate text-[11px] text-muted">
            {#if members.length > 1}<i class="h-2 w-2 shrink-0 rounded-full" style="background: {COLORS[i]}"></i>{/if}
            Reste{members.length > 1 ? ` ${b.member.display_name}` : ''}
          </span>
          <strong class="num mt-0.5 block truncate font-serif text-[18px] font-medium {b.remaining < 0 ? 'text-danger' : 'text-deep'}">
            <Counter value={b.remaining} />
          </strong>
        </div>
      {/each}
    </div>
    <!-- Le prolongement naturel de l'encadré : le même jeu, sur un budget entier. -->
    <a href="/demo" class="group mt-3 flex items-center justify-center gap-1.5 rounded-control py-1.5 text-[12px] font-semibold text-deep hover:bg-pale">
      Ouvrir la démo complète
      <span class="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true">→</span>
    </a>
  </div>
</div>
