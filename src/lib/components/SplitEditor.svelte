<script lang="ts">
  import {
    incomeWeights,
    isDefaultSplit,
    monthlyAmount,
    rebalance,
    shareOf,
    splitPercents,
    splitPreset
  } from '$lib/budget/calc';
  import { memberColor } from '$lib/budget/colors';
  import Chevron from './Chevron.svelte';
  import type { BudgetState } from '$lib/budget/state.svelte';
  import { money } from '$lib/format';
  import type { BudgetMember, Transaction } from '$lib/types';

  /**
   * Qui paie quelle part d'une ligne. Partagé par la grille et par la fiche
   * mobile : deux éditeurs écrivant les mêmes poids doivent les écrire pareil.
   *
   * Dans la grille, la cellule ne montre qu'un résumé (une barre aux couleurs
   * des membres et un libellé) qui ouvre le panneau d'édition : 164px ne
   * suffisaient ni à trois champs nommés ni à un curseur lisible. Dans la
   * fiche (`roomy`), le panneau est affiché tel quel.
   *
   * Le panneau a un curseur par membre, quel que soit leur nombre : bouger
   * l'un rééquilibre les autres (`rebalance`), si bien que le total reste à
   * 100 % et que la valeur lue est celle qu'on vient de choisir.
   */
  interface Props {
    tx: Transaction;
    members: BudgetMember[];
    sheet: BudgetState;
    /** Fiche mobile : panneau en ligne et cibles tactiles à taille de doigt. */
    roomy?: boolean;
  }
  let { tx, members, sheet, roomy = false }: Props = $props();

  const uid = $props.id();

  const percents = $derived(splitPercents(tx, members));
  const preset = $derived(splitPreset(tx, sheet.transactions, members));
  const byIncome = $derived(incomeWeights(sheet.transactions, members));

  const PRESET_LABELS: Record<string, string> = { equal: 'Parts égales', income: 'Selon les revenus' };

  /** Libellé du résumé : ce que la répartition *veut dire* avant ses chiffres. */
  const summary = $derived.by(() => {
    if (preset === 'equal' || preset === 'income') return PRESET_LABELS[preset];
    if (preset.startsWith('only:')) {
      const member = members.find((m) => `only:${m.id}` === preset);
      return `100 % ${member?.display_name ?? '?'}`;
    }
    return members.map((m) => percents.get(m.id) ?? 0).join(' · ');
  });

  const detail = $derived(
    members
      .map((m) => `${m.display_name} : ${percents.get(m.id) ?? 0} % · ${money(shareOf(tx, m.id, members))} / mois`)
      .join('\n')
  );

  /** Écrit des poids, ou supprime les splits s'ils ne disent que le défaut. */
  function write(weights: Map<string, number>) {
    if (isDefaultSplit(tx.member_id, weights, members)) sheet.clearWeights(tx.id);
    else sheet.setWeights(tx.id, weights);
  }

  function setPercent(memberId: string, value: number) {
    write(rebalance(percents, members, memberId, value));
  }

  function only(memberId: string) {
    write(new Map(members.map((m) => [m.id, m.id === memberId ? 100 : 0])));
  }

  // ── Panneau flottant (grille) ────────────────────────────────────────────
  // L'API Popover le sort dans la couche supérieure : la grille défile en
  // `overflow-x-auto` et rognerait tout panneau positionné à l'intérieur.
  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);
  let open = $state(false);

  function place() {
    if (!trigger || !panel) return;
    const r = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), innerWidth - width - 8);
    // Sous la cellule, ou au-dessus si la place manque en bas de l'écran.
    const below = r.bottom + 6;
    const top = below + height > innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  /**
   * Placé avant le premier rendu, pas après : `toggle` arrive en tâche
   * différée, une fois le panneau déjà peint à sa position par défaut — on le
   * voyait surgir à gauche de l'écran puis sauter sous la cellule.
   * `beforetoggle` précède l'ouverture, et la frame demandée ici passe après
   * elle mais avant la peinture : le panneau est mesurable et pas encore vu.
   */
  function onbeforetoggle(e: ToggleEvent) {
    if (e.newState === 'open') requestAnimationFrame(place);
  }

  function ontoggle(e: ToggleEvent) {
    open = e.newState === 'open';
    if (!open) void sheet.flush();
  }
</script>

<svelte:window
  onresize={() => open && place()}
  onscrollcapture={(e) => {
    // Défiler sous un panneau fixe le décollerait de sa ligne : on le ferme.
    if (open && !panel?.contains(e.target as Node)) panel?.hidePopover();
  }}
/>

{#snippet editor()}
  <div class="flex flex-col {roomy ? 'gap-3' : 'gap-2.5'}">
    <!-- Raccourcis : les répartitions qu'on choisit neuf fois sur dix, en un geste. -->
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Répartitions courantes">
      {#each [{ key: 'equal', label: 'Parts égales', disabled: false }, { key: 'income', label: 'Selon les revenus', disabled: !byIncome }] as p (p.key)}
        <button
          type="button"
          class="rounded-full border px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 {roomy
            ? 'min-h-[36px]'
            : 'py-1'} {preset === p.key
            ? 'border-[#bcebd5] bg-pale font-semibold text-deep'
            : 'border-line bg-panel text-muted hover:border-[#bcebd5] hover:text-fg'}"
          aria-pressed={preset === p.key}
          disabled={p.disabled}
          title={p.disabled ? 'Aucun revenu saisi pour l’instant' : undefined}
          onclick={() =>
            p.key === 'equal' ? write(new Map(members.map((m) => [m.id, 1]))) : byIncome && write(byIncome)}
        >
          {p.label}
        </button>
      {/each}
      {#each members as member (member.id)}
        <button
          type="button"
          class="rounded-full border px-2.5 text-[12px] transition-colors {roomy ? 'min-h-[36px]' : 'py-1'} {preset ===
          `only:${member.id}`
            ? 'border-[#bcebd5] bg-pale font-semibold text-deep'
            : 'border-line bg-panel text-muted hover:border-[#bcebd5] hover:text-fg'}"
          aria-pressed={preset === `only:${member.id}`}
          onclick={() => only(member.id)}
        >
          100 % {member.display_name}
        </button>
      {/each}
    </div>

    <!-- Un curseur par membre : nom, part, et ce que ça fait en francs. -->
    <div class="flex flex-col {roomy ? 'gap-3' : 'gap-2'}">
      {#each members as member, k (member.id)}
        {@const value = percents.get(member.id) ?? 0}
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span class="flex min-w-0 items-center gap-1.5 {roomy ? 'text-[14px]' : 'text-[12.5px]'}">
            <i class="h-2 w-2 shrink-0 rounded-full" style="background: {memberColor(k)}"></i>
            <b class="truncate font-semibold">{member.display_name}</b>
            <span class="num ml-auto shrink-0 text-muted">{money(shareOf(tx, member.id, members))}</span>
          </span>
          <label class="flex items-center gap-1">
            <input
              type="number"
              inputmode="numeric"
              min="0"
              max="100"
              aria-label="Part de {member.display_name}, en pourcentage"
              class="num rounded border border-line bg-panel text-right outline-none focus:border-green {roomy
                ? 'w-[60px] px-2 py-1.5'
                : 'w-[46px] px-1.5 py-0.5'}"
              {value}
              onchange={(e) => setPercent(member.id, Number(e.currentTarget.value) || 0)}
            />
            <span class="text-[12px] text-muted">%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            class="col-span-2 w-full accent-deep {roomy ? 'h-7' : 'h-4'}"
            aria-label="Part de {member.display_name}"
            {value}
            oninput={(e) => setPercent(member.id, Number(e.currentTarget.value))}
          />
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet bar(height: string)}
  <span class="flex w-full overflow-hidden rounded-full bg-line {height}" aria-hidden="true">
    {#each members as member, k (member.id)}
      <span
        class="h-full transition-[width] duration-300"
        style="width: {percents.get(member.id) ?? 0}%; background: {memberColor(k)}"
      ></span>
    {/each}
  </span>
{/snippet}

{#if members.length < 2}
  <span class="px-1 text-muted">—</span>
{:else if roomy}
  <div class="flex flex-col gap-3">
    {@render bar('h-2')}
    {@render editor()}
  </div>
{:else}
  <button
    bind:this={trigger}
    type="button"
    popovertarget="split-{uid}"
    class="group flex w-full min-w-0 flex-col gap-1 rounded border px-1.5 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-line {open
      ? 'border-[#bcebd5] bg-panel'
      : 'border-transparent bg-transparent hover:border-line hover:bg-panel'}"
    title={detail}
    aria-label="Répartition : {summary}. Modifier"
  >
    {@render bar('h-1.5')}
    <span class="num flex items-center justify-between gap-1 text-[12px] leading-none">
      <span class="truncate {preset === 'custom' ? 'text-fg' : 'text-muted'}">{summary}</span>
      <span class="text-muted transition-colors group-hover:text-deep {open ? 'text-deep' : ''}">
        <Chevron {open} size={12} />
      </span>
    </span>
  </button>

  <div
    bind:this={panel}
    id="split-{uid}"
    popover="auto"
    {onbeforetoggle}
    {ontoggle}
    class="split-panel m-0 w-[300px] rounded-card border border-line bg-panel p-3.5 text-fg shadow-[0_18px_40px_-16px_rgba(28,31,29,0.28)]"
    style="position: fixed; inset: auto"
  >
    <div class="mb-2.5 flex items-baseline justify-between gap-2">
      <b class="text-[13px]">Qui paie</b>
      <span class="num truncate text-[11.5px] text-muted">{tx.name || 'Sans nom'} · {money(monthlyAmount(tx))} / mois</span>
    </div>
    {@render editor()}
  </div>
{/if}

<style>
  /* Une apparition brève plutôt qu'un surgissement : l'œil suit d'où vient le
     panneau. Coupée par la règle `prefers-reduced-motion` de app.css. */
  .split-panel:popover-open {
    animation: split-in 0.14s ease-out;
  }
  @keyframes split-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }
</style>
