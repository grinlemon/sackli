<script lang="ts">
  import { page } from '$app/state';

  /**
   * L'en-tête des écrans d'un budget : fil d'Ariane, titre de la vue, nombre
   * de membres. Partagé par l'app et par la démo.
   */
  let { budgetName, memberCount }: { budgetName: string; memberCount: number } = $props();

  const onAnalyse = $derived(page.url.pathname.endsWith('/analyse'));
  const onSettings = $derived(page.url.pathname.endsWith('/settings'));
  const onExport = $derived(page.url.pathname.endsWith('/export'));
  const title = $derived(
    onAnalyse
      ? "Vue d'ensemble"
      : onSettings
        ? 'Paramètres du budget'
        : onExport
          ? 'Export PDF'
          : 'Préparer le budget'
  );
  const crumb = $derived(
    onAnalyse ? 'Analyse' : onSettings ? 'Paramètres' : onExport ? 'Export' : 'Budget'
  );
</script>

<svelte:head><title>{budgetName} — {crumb} — säckli</title></svelte:head>

<header class="flex h-[90px] items-center justify-between border-b border-line max-sm:h-auto max-sm:pt-4 max-sm:pb-3 print:hidden">
  <div>
    <!-- En mobile, le nom du budget est déjà dans la barre du haut. -->
    <p class="m-0 mb-1.5 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase max-sm:hidden">
      {budgetName} / {crumb}
    </p>
    <h1 class="m-0 font-serif text-[28px] font-medium text-[#34433d] max-sm:text-[22px]">{title}</h1>
  </div>
  <span class="rounded-control border border-line bg-panel px-3 py-2.5 text-muted max-sm:hidden">
    {memberCount} membre{memberCount > 1 ? 's' : ''}
  </span>
</header>
