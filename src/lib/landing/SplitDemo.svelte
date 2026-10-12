<script lang="ts">
  import { shareOf } from '$lib/budget/calc';
  import { money, pct } from '$lib/format';
  import type { Transaction } from '$lib/types';
  import { demoHousehold } from './demo';

  /**
   * Une dépense commune, trois personnes : les poids passent par `shareOf`,
   * comme dans l'app. Ce sont des poids, pas des pourcentages — rien n'oblige
   * les curseurs à totaliser 100.
   */
  const { members, transactions } = demoHousehold(3);
  const incomes = members.map((m) =>
    transactions.filter((t) => t.kind === 'income' && t.member_id === m.id).reduce((a, t) => a + t.amount, 0)
  );

  type Mode = 'equal' | 'income' | 'custom';
  const MODES: { key: Mode; label: string }[] = [
    { key: 'equal', label: 'Parts égales' },
    { key: 'income', label: 'Selon les revenus' },
    { key: 'custom', label: 'Libre' }
  ];

  let mode = $state<Mode>('income');
  let amount = $state(2950);
  let custom = $state([50, 30, 20]);

  const weights = $derived(mode === 'equal' ? null : mode === 'income' ? incomes : custom);

  const tx = $derived<Transaction>({
    id: 'split-demo',
    budget_id: 'demo',
    name: 'Loyer',
    kind: 'expense',
    amount,
    category_id: null,
    frequency: 'monthly',
    member_id: null,
    account: null,
    position: 0,
    // Parts égales : aucun split, c'est le défaut implicite du modèle.
    splits: weights ? members.map((m, i) => ({ transaction_id: 'split-demo', member_id: m.id, weight: weights[i] })) : []
  });

  const parts = $derived(members.map((m) => shareOf(tx, m.id, members)));
  const COLORS = ['var(--color-member-a)', 'var(--color-member-b)', '#6f8f83'];
</script>

<div class="rounded-[10px] border border-line bg-panel p-5">
  <div class="flex items-end gap-3">
    <label class="min-w-0 flex-1">
      <span class="mb-1 block text-[11px] text-muted">Loyer, par mois</span>
      <input
        type="number"
        inputmode="numeric"
        min="0"
        step="50"
        class="num w-full rounded-control border border-line bg-panel px-3 py-2 text-[15px] outline-none focus:border-green"
        value={amount}
        oninput={(e) => (amount = Math.max(0, Number(e.currentTarget.value) || 0))}
      />
    </label>
  </div>

  <div class="mt-4 grid grid-cols-3 overflow-hidden rounded-control border border-line" role="group" aria-label="Mode de répartition">
    {#each MODES as m (m.key)}
      <button
        class="border-0 px-2 py-2 text-[12px] max-sm:min-h-[40px] {mode === m.key
          ? 'bg-pale font-bold text-deep'
          : 'bg-panel text-muted hover:bg-bg'}"
        aria-pressed={mode === m.key}
        onclick={() => (mode = m.key)}
      >
        {m.label}
      </button>
    {/each}
  </div>

  <div class="mt-4 flex h-[30px] overflow-hidden rounded-control border border-line">
    {#each members as m, i (m.id)}
      <div
        class="transition-[width] duration-200"
        style="width: {amount > 0 ? (parts[i] / amount) * 100 : 100 / members.length}%; background: {COLORS[i]}"
        title="{m.display_name} — {money(parts[i])}"
      ></div>
    {/each}
  </div>

  <div class="mt-3 divide-y divide-line">
    {#each members as m, i (m.id)}
      <div class="flex items-center gap-3 py-2">
        <span class="flex w-[64px] shrink-0 items-center gap-1.5 text-[12.5px]">
          <i class="h-2 w-2 shrink-0 rounded-full" style="background: {COLORS[i]}"></i>
          <b class="truncate">{m.display_name}</b>
        </span>
        {#if mode === 'custom'}
          <input
            type="range"
            min="0"
            max="100"
            class="min-w-0 flex-1 accent-deep"
            aria-label="Poids de {m.display_name}"
            bind:value={custom[i]}
          />
        {:else}
          <span class="num min-w-0 flex-1 truncate text-[11.5px] text-muted max-sm:invisible">
            {mode === 'income' ? `revenu ${money(incomes[i])}` : 'une part sur trois'}
          </span>
        {/if}
        <span class="num w-[36px] shrink-0 text-right text-[11.5px] text-muted">
          {amount > 0 ? pct((parts[i] / amount) * 100) : '—'}
        </span>
        <b class="num w-[84px] shrink-0 text-right font-serif text-[16px] font-medium text-deep">{money(parts[i])}</b>
      </div>
    {/each}
  </div>
</div>
