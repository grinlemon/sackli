<script lang="ts">
  import { page } from '$app/state';
  import AppShell, { type ShellLink } from '$lib/components/AppShell.svelte';

  let { data, children } = $props();

  const initials = $derived(
    data.displayName
      .split(/[\s.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0]?.toUpperCase())
      .join('·') || 'S'
  );

  const currentBudget = $derived(data.budgets.find((b) => b.id === page.params.id) ?? null);
  const base = $derived(currentBudget ? `/budgets/${currentBudget.id}` : null);

  const links: ShellLink[] = $derived(
    base
      ? [
          { href: base, label: 'Budget', short: 'Budget', icon: 'budget', exact: true },
          { href: `${base}/analyse`, label: 'Analyse', short: 'Analyse', icon: 'analyse', exact: false },
          { href: `${base}/settings`, label: 'Paramètres', short: 'Réglages', icon: 'settings', exact: false },
          { href: `${base}/export`, label: 'Export PDF', short: 'PDF', icon: 'export', exact: false }
        ]
      : []
  );
</script>

<AppShell
  {links}
  budgetName={currentBudget?.name ?? null}
  home={{ href: '/budgets', label: 'Mes budgets', title: 'Changer de budget' }}
>
  {#snippet mobileAccount()}
    <!-- L'avatar mène au compte, qui porte la déconnexion : un toucher sur
         l'avatar ne doit pas suffire à sortir. -->
    <a
      href="/account"
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d7e9e1] text-[12px] font-bold text-[#287356] sm:hidden"
      aria-label="Mon compte ({data.user.email})"
      title="Mon compte"
    >
      {initials}
    </a>
  {/snippet}

  {#snippet account()}
    <a href="/account" class="mt-3 flex items-center gap-2.5 rounded-control border-t border-line px-2 pt-3.5 pb-1 hover:bg-bg">
      <span class="grid h-[25px] w-[25px] shrink-0 place-items-center rounded-full bg-[#d7e9e1] text-[11px] font-bold text-[#287356]">
        {initials}
      </span>
      <div class="min-w-0">
        <b class="block truncate">{data.displayName}</b>
        <small class="mt-0.5 block truncate text-[10px] text-muted">{data.user.email}</small>
      </div>
    </a>
    <form method="POST" action="/logout" class="mt-2">
      <button class="w-full rounded-control px-2.5 py-2 text-left text-[12px] text-muted hover:bg-bg">
        Se déconnecter
      </button>
    </form>
  {/snippet}

  {@render children()}
</AppShell>
