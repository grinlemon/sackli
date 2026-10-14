<script lang="ts" module>
  export interface SwitcherBudget {
    id: string;
    name: string;
    /** Destination : la même page dans ce budget-là. */
    href: string;
  }
</script>

<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import Chevron from './Chevron.svelte';

  /**
   * Le sélecteur de budget de la coquille : un menu qui liste les budgets et
   * mène à la même page dans celui qu'on choisit, plutôt qu'un détour par
   * « Mes budgets ». La liste complète reste à un clic, en bas du menu.
   */
  interface Props {
    budgets: SwitcherBudget[];
    currentId: string | null;
    /** Libellé quand aucun budget n'est ouvert, et lien vers la liste. */
    home: { href: string; label: string };
    variant: 'sidebar' | 'mobile';
  }
  let { budgets, currentId, home, variant }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  const current = $derived(budgets.find((b) => b.id === currentId) ?? null);

  afterNavigate(() => (open = false));

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

<div bind:this={root} class="relative {variant === 'mobile' ? 'min-w-0 flex-1 sm:hidden' : 'max-sm:hidden'}">
  <button
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
    class={variant === 'mobile'
      ? 'flex min-h-[40px] w-full min-w-0 items-center gap-1.5 rounded-control px-2 text-left text-[15px] font-semibold'
      : 'group flex w-full items-center gap-2 rounded-control border p-2.5 text-left text-[12px] text-[#3d4541] transition-colors hover:border-[#bcebd5] hover:bg-bg ' +
        (open ? 'border-[#bcebd5] bg-bg' : 'border-line')}
  >
    {#if variant === 'sidebar'}<span class="h-[7px] w-[7px] shrink-0 rounded-full bg-green"></span>{/if}
    <span class="truncate">{current?.name ?? home.label}</span>
    <span class="text-muted transition-colors group-hover:text-deep {variant === 'sidebar' ? 'ml-auto' : ''}">
      <Chevron {open} />
    </span>
  </button>

  {#if open}
    <div
      role="menu"
      class="absolute top-[calc(100%+4px)] z-40 max-h-[min(60vh,420px)] overflow-y-auto rounded-control border border-line bg-panel p-1 shadow-lg
        {variant === 'mobile' ? 'left-0 w-[min(320px,calc(100vw-24px))]' : 'inset-x-0'}"
    >
      {#each budgets as budget (budget.id)}
        {@const active = budget.id === currentId}
        <a
          role="menuitem"
          href={budget.href}
          aria-current={active ? 'page' : undefined}
          class="flex items-center gap-2 rounded-[4px] px-2.5 py-2 text-[12px] max-sm:min-h-[44px] max-sm:text-[14px] {active
            ? 'bg-pale font-bold text-deep'
            : 'text-[#3d4541] hover:bg-bg'}"
        >
          <span class="h-[7px] w-[7px] shrink-0 rounded-full {active ? 'bg-green' : 'bg-line'}"></span>
          <span class="truncate">{budget.name}</span>
        </a>
      {/each}
      {#if budgets.length === 0}
        <p class="m-0 px-2.5 py-2 text-[12px] text-muted">Aucun budget pour l’instant.</p>
      {/if}
      <a
        role="menuitem"
        href={home.href}
        class="mt-1 flex items-center rounded-[4px] border-t border-line px-2.5 pt-2.5 pb-2 text-[12px] text-muted hover:bg-bg hover:text-fg max-sm:min-h-[44px] max-sm:text-[14px]"
      >
        Tous mes budgets…
      </a>
    </div>
  {/if}
</div>
