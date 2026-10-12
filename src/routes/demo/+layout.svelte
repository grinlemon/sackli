<script lang="ts">
  import { page } from '$app/state';
  import { ogImage } from '$lib/seo';
  import AppShell, { type ShellLink } from '$lib/components/AppShell.svelte';
  import BudgetHeader from '$lib/components/BudgetHeader.svelte';
  import { DemoSession, setDemo } from '$lib/demo/session.svelte';

  let { children } = $props();

  const demo = new DemoSession();
  setDemo(demo);

  // Pas de Paramètres : membres, catégories et invitations passent par des
  // actions serveur qui écrivent en base. La démo s'en tient à ce qui se joue
  // entièrement dans l'onglet.
  const links: ShellLink[] = [
    { href: '/demo', label: 'Budget', short: 'Budget', icon: 'budget', exact: true },
    { href: '/demo/analyse', label: 'Analyse', short: 'Analyse', icon: 'analyse', exact: false },
    { href: '/demo/export', label: 'Export PDF', short: 'PDF', icon: 'export', exact: false }
  ];
</script>

<svelte:head>
  <meta
    name="description"
    content="Essayez säckli sans compte : un vrai budget de couple à modifier librement — répartition selon les revenus, analyse, export PDF. Rien n'est enregistré."
  />
  <!-- Un lien vers la démo se partage autant que l'accueil : même aperçu. -->
  <link rel="canonical" href="{page.url.origin}/demo" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="säckli" />
  <meta property="og:locale" content="fr_CH" />
  <meta property="og:url" content="{page.url.origin}/demo" />
  <meta property="og:title" content="Essayez säckli, sans compte" />
  <meta
    property="og:description"
    content="Un vrai budget de couple à modifier librement : répartition selon les revenus, analyse, export PDF. Rien n'est enregistré."
  />
  <meta property="og:image" content={ogImage(page.url.origin)} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="säckli — votre budget, au clair : une démo à modifier en direct." />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<AppShell {links} budgetName={demo.budget.name} home={{ href: '/', label: 'Accueil', title: 'Retour à l’accueil' }}>
  {#snippet mobileAccount()}
    <a
      href="/signup"
      class="shrink-0 rounded-full bg-green px-3.5 py-2 text-[13px] font-bold text-[#143b2b] sm:hidden"
    >
      Créer un compte
    </a>
  {/snippet}

  {#snippet account()}
    <div class="rounded-card border border-[#bcebd5] bg-pale p-3.5">
      <b class="block text-[13px] text-deep">Ça vous parle ?</b>
      <p class="mt-1 mb-3 text-[12px] leading-relaxed text-[#3d4541]">
        Créez votre compte pour garder votre budget et le partager avec votre foyer.
      </p>
      <a
        href="/signup"
        class="block rounded-control bg-green px-3 py-2 text-center text-[13px] font-bold text-[#143b2b] hover:brightness-96"
      >
        Créer mon budget
      </a>
    </div>
  {/snippet}

  <!-- Le bandeau dit d'emblée la règle du jeu : tout se modifie, rien ne reste. -->
  <div
    class="mt-5 flex items-center gap-x-4 gap-y-2 rounded-card border border-[#bcebd5] bg-pale px-4 py-3 text-[13px] text-[#2b4a3d] max-sm:mt-3 max-sm:gap-x-2.5 max-sm:px-3 max-sm:py-2 print:hidden"
    role="note"
  >
    <span class="rounded-full bg-green px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#143b2b] uppercase">Démo</span>
    <span class="min-w-0 flex-1">
      <span class="max-sm:hidden">Modifiez tout ce que vous voulez : rien n'est enregistré, tout disparaît en fermant l'onglet.</span>
      <span class="sm:hidden">Tout se modifie, rien n'est enregistré.</span>
    </span>
    <button
      type="button"
      class="rounded-control border border-[#bcebd5] bg-panel px-3 py-1.5 text-[12px] text-deep hover:bg-bg"
      onclick={() => demo.reset()}
    >
      Réinitialiser
    </button>
  </div>

  <BudgetHeader budgetName={demo.budget.name} memberCount={demo.members.length} />

  {@render children()}
</AppShell>
