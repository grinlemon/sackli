<script lang="ts" module>
  import type { NavIconName } from './NavIcon.svelte';

  export interface ShellLink {
    href: string;
    label: string;
    /** Libellé des onglets mobiles, où la place manque. */
    short: string;
    icon: NavIconName;
    /** Actif seulement sur ce chemin exact (sinon sur tout ce qui commence par lui). */
    exact: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import BudgetSwitcher, { type SwitcherBudget } from './BudgetSwitcher.svelte';
  import Chevron from './Chevron.svelte';
  import Logo from './Logo.svelte';
  import NavIcon from './NavIcon.svelte';

  /**
   * La coquille de l'app : barre latérale, bandeau et onglets mobiles. Partagée
   * par l'app et par la démo, qui doit montrer exactement la même interface —
   * seuls changent la destination de la marque, la navigation et le pied de
   * la barre (compte ou appel à s'inscrire).
   */
  interface Props {
    links: ShellLink[];
    /** Nom du budget courant ; null hors d'un budget. */
    budgetName: string | null;
    /** Où mènent la marque et le sélecteur de budget. */
    home: { href: string; label: string; title: string };
    /**
     * Les budgets entre lesquels passer : le sélecteur devient un menu. Absent
     * (la démo n'a qu'un budget), il reste un simple lien vers `home`.
     */
    switcher?: { budgets: SwitcherBudget[]; currentId: string | null };
    /** Pied de la barre latérale (bureau). */
    account: Snippet;
    /** À droite du bandeau mobile. */
    mobileAccount: Snippet;
    children: Snippet;
  }
  let { links, budgetName, home, switcher, account, mobileAccount, children }: Props = $props();

  // <main> est le conteneur de scroll et survit aux navigations ; SvelteKit ne
  // réinitialise que celui du document, donc on le fait nous-mêmes.
  let mainEl = $state<HTMLElement | null>(null);
  afterNavigate((nav) => {
    if (nav.to?.url.hash) return;
    mainEl?.scrollTo(0, 0);
  });

  function isActive(href: string, exact: boolean) {
    return exact ? page.url.pathname === href : page.url.pathname.startsWith(href);
  }
</script>

<!-- Le menu reste fixe : le conteneur occupe exactement la hauteur de l'écran et
     c'est <main> qui scrolle. En mobile, le document redevient le conteneur de
     scroll : la barre latérale se réduit à un bandeau en haut (marque, budget
     courant, déconnexion) et la navigation descend en bas, sous le pouce. -->
<div class="flex h-screen overflow-hidden max-sm:block max-sm:h-auto max-sm:overflow-visible print:block print:h-auto print:overflow-visible">
  <aside class="flex w-[245px] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel px-3.5 pt-[22px] pb-3.5 max-lg:w-[205px] max-sm:sticky max-sm:top-0 max-sm:z-20 max-sm:w-auto max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:overflow-visible max-sm:border-r-0 max-sm:border-b max-sm:px-3 max-sm:pt-[max(8px,env(safe-area-inset-top))] max-sm:pb-2 print:hidden">
    <a href={home.href} class="flex items-center gap-2.5 px-2.5 pb-6 text-[15px] font-bold max-sm:shrink-0 max-sm:px-0 max-sm:pb-0" aria-label={home.label}>
      <span class="max-sm:hidden"><Logo /></span>
      <span class="sm:hidden"><Logo wordmark={false} /></span>
    </a>

    <!-- Mobile : le budget courant — le seul repère « où suis-je » une fois la
         barre latérale partie, et le moyen d'en changer. -->
    {#if switcher}
      <BudgetSwitcher {...switcher} {home} variant="mobile" />
    {:else}
    <a
      href={home.href}
      class="flex min-h-[40px] min-w-0 flex-1 items-center gap-1.5 rounded-control px-2 text-[15px] font-semibold sm:hidden"
    >
      <span class="truncate">{budgetName ?? home.label}</span>
      {#if budgetName}<span class="text-muted"><Chevron /></span>{/if}
    </a>
    {/if}
    {@render mobileAccount()}

    {#if switcher}
      <BudgetSwitcher {...switcher} {home} variant="sidebar" />
    {:else}
    <a
      href={home.href}
      class="group flex items-center gap-2 rounded-control border border-line p-2.5 text-[12px] text-[#3d4541] transition-colors hover:border-[#bcebd5] hover:bg-bg max-sm:hidden"
      title={home.title}
    >
      <span class="h-[7px] w-[7px] shrink-0 rounded-full bg-green"></span>
      <span class="truncate">{budgetName ?? home.label}</span>
      <span class="ml-auto text-muted transition-colors group-hover:text-deep"><Chevron /></span>
    </a>
    {/if}

    <nav class="mt-6 flex flex-col gap-0.5 max-sm:hidden">
      {#each links as link (link.href)}
        {@const active = isActive(link.href, link.exact)}
        <a
          href={link.href}
          aria-current={active ? 'page' : undefined}
          class="group flex items-center gap-2.5 rounded-control px-2.5 py-2.5 transition-colors
            {active ? 'bg-pale font-bold text-deep' : 'text-muted hover:bg-bg hover:text-fg'}"
        >
          <span class={active ? 'text-deep' : 'text-[#9aa29e] group-hover:text-muted'}>
            <NavIcon name={link.icon} />
          </span>
          {link.label}
        </a>
      {/each}
      {#if links.length === 0}
        <a
          href={home.href}
          aria-current="page"
          class="flex items-center gap-2.5 rounded-control bg-pale px-2.5 py-2.5 font-bold text-deep"
        >
          <NavIcon name="budget" />{home.label}
        </a>
      {/if}
    </nav>

    <div class="mt-auto max-sm:hidden">
      {@render account()}
    </div>
  </aside>

  <main
    bind:this={mainEl}
    class="min-w-0 flex-1 overflow-y-auto px-[clamp(22px,4vw,64px)] max-sm:overflow-visible max-sm:px-3.5 print:overflow-visible print:px-0
      {links.length ? 'max-sm:pb-[calc(76px+env(safe-area-inset-bottom))]' : 'max-sm:pb-8'}"
  >
    {@render children()}
  </main>
</div>

<!-- Onglets du bas : la zone que le pouce atteint sans changer de prise. Quatre
     destinations au plus, icône et libellé — une icône seule ne se devine pas. -->
{#if links.length}
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden print:hidden"
    aria-label="Navigation du budget"
  >
    {#each links as link (link.href)}
      {@const active = isActive(link.href, link.exact)}
      <a
        href={link.href}
        aria-current={active ? 'page' : undefined}
        class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] {active
          ? 'font-bold text-deep'
          : 'text-muted'}"
      >
        <!-- Pastille derrière l'icône active : l'onglet courant se repère au
             pouce, pas seulement à la graisse du libellé. -->
        <span class="grid h-7 w-12 place-items-center rounded-full {active ? 'bg-pale' : ''}">
          <NavIcon name={link.icon} size={20} />
        </span>
        {link.short}
      </a>
    {/each}
  </nav>
{/if}
