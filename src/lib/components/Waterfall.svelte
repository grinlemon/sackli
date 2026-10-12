<script lang="ts">
  import type { MemberBreakdown } from '$lib/budget/calc';
  import { money } from '$lib/format';

  interface Props {
    breakdown: MemberBreakdown;
    color: string;
  }
  let { breakdown: b, color }: Props = $props();

  const steps = $derived([
    { label: 'Entrée', value: b.income, negative: false, final: false },
    { label: '− Participation aux dépenses communes', value: b.common, negative: true, final: false },
    { label: 'Reste', value: b.afterCommon, negative: false, final: false },
    { label: '− Dépenses personnelles', value: b.personal, negative: true, final: false },
    { label: 'Reste final', value: b.remaining, negative: false, final: true }
  ]);
</script>

<div class="rounded-card border border-line bg-panel p-5">
  <div class="mb-1.5 flex items-center gap-2">
    <span class="h-[9px] w-[9px] shrink-0 rounded-full" style="background:{color}"></span>
    <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">
      Détail {b.member.display_name}
    </h2>
  </div>

  <div class="border-t border-line">
    {#each steps as step (step.label)}
      <div
        class="flex justify-between border-b border-line py-2 text-[12.5px] last:border-b-0 {step.final
          ? 'pt-3'
          : ''}"
      >
        <span class={step.final ? 'font-bold text-fg' : 'text-muted'}>{step.label}</span>
        {#if step.final}
          <b class="num font-serif text-[19px] font-medium text-deep">{money(step.value)}</b>
        {:else}
          <b class="num {step.negative ? 'text-danger' : ''}">
            {step.negative ? '−' : ''}{money(step.value)}
          </b>
        {/if}
      </div>
    {/each}
  </div>
</div>
