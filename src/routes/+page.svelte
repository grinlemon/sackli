<script lang="ts">
  import FlowDemo from '$lib/landing/FlowDemo.svelte';
  import HeroDemo from '$lib/landing/HeroDemo.svelte';
  import SplitDemo from '$lib/landing/SplitDemo.svelte';
  import { reveal } from '$lib/landing/reveal';
  import { page } from '$app/state';
  import Logo from '$lib/components/Logo.svelte';
  import { ogImage } from '$lib/seo';

  let { data } = $props();

  /** L'en-tête reste collé en haut et ne prend fond et bordure qu'une fois la page défilée. */
  let scrolled = $state(false);

  const TITLE = 'säckli — budget du foyer et partage des dépenses';
  const DESCRIPTION =
    'Voyez enfin clair dans vos dépenses : säckli montre où part votre argent, partage les dépenses communes équitablement selon les revenus et ce qu’il reste à chacun. Gratuit, en CHF.';
  // Absolues, sur l'origine réelle : LinkedIn, WhatsApp ou Google n'acceptent
  // pas une image ou une URL canonique relative.
  const canonical = $derived(`${page.url.origin}/`);
  const image = $derived(ogImage(page.url.origin));
  /** Données structurées : ce que Google affiche comme fiche d'application. */
  const jsonLd = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'säckli',
      url: canonical,
      image,
      description: DESCRIPTION,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'fr-CH',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CHF' }
    })
  );

  const primary = $derived(
    data.signedIn ? { href: '/budgets', label: 'Ouvrir mes budgets' } : { href: '/signup', label: 'Créer un budget' }
  );

  const POINTS = [
    {
      title: 'Une répartition juste',
      text: 'Des revenus différents, un même loyer ? säckli calcule la part de chacun pour que personne ne porte plus que l’autre.'
    },
    {
      title: 'Voir où part l’argent',
      text: 'Un diagramme suit chaque franc, du salaire jusqu’à la dernière dépense : on voit tout de suite ce qui pèse le plus.'
    },
    {
      title: 'Ce qu’il reste, pour chacun',
      text: 'Revenus, dépenses communes, dépenses personnelles : le reste de chaque membre, d’un coup d’œil.'
    }
  ];

  /** Icônes au trait, sur une grille de 24 : des glyphes Unicode n'ont ni la même taille ni la même graisse. */
  const EXTRAS = [
    {
      icon: 'M3 6.5h18v11H3zM3 7l9 6 9-6',
      title: 'Invitations par email',
      text: 'Chaque membre retrouve le budget en se connectant.'
    },
    {
      icon: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0',
      dashed: true,
      title: 'Membres sans compte',
      text: 'Un enfant, un colocataire : présent dans le calcul, sans inscription.'
    },
    {
      icon: 'M4 5h10M8 10h12M8 15h12M4 5v10h4',
      title: 'Catégories sur deux niveaux',
      text: 'Un jeu complet dès le départ, à adapter à votre foyer.'
    },
    {
      icon: 'M8 8h12v12H8zM16 8V4H4v12h4',
      title: 'Plusieurs budgets',
      text: 'Dupliquez-en un pour tester un scénario sans toucher au vrai.'
    },
    {
      icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
      title: 'Export PDF',
      text: 'Un rapport A4 propre, diagramme compris.'
    },
    {
      icon: 'M7 3h10v18H7zM11 18h2',
      title: 'Sur téléphone',
      text: 'Les totaux d’abord, la saisie sous le pouce.'
    }
  ];

  const FAQ = [
    {
      q: 'Est-ce vraiment gratuit ?',
      a: 'Oui, säckli est entièrement gratuit pour l’instant. Et chaque budget s’exporte à tout moment : vos données restent les vôtres.'
    },
    {
      q: 'Tout le monde doit-il avoir un compte ?',
      a: 'Non. Un membre peut exister sans compte et compter quand même dans la répartition. Ceux qui veulent voir le budget reçoivent une invitation par email et le retrouvent à leur première connexion.'
    },
    {
      q: 'Et les factures qui tombent une fois par an ?',
      a: 'Saisissez-les telles quelles, à l’année : säckli les ramène au mois avant de les répartir, pour qu’elles pèsent ce qu’elles pèsent vraiment chaque mois.'
    },
    {
      q: 'Puis-je récupérer mes données ?',
      a: 'À tout moment : chaque budget s’exporte en JSON, réimportable tel quel, ou en PDF pour l’imprimer.'
    }
  ];
</script>

<svelte:head>
  <title>{TITLE}</title>
  <meta name="description" content={DESCRIPTION} />
  <link rel="canonical" href={canonical} />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="säckli" />
  <meta property="og:locale" content="fr_CH" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content="säckli — votre budget, au clair" />
  <meta
    property="og:description"
    content="Voir clair dans ses dépenses, seul ou à plusieurs : où part l’argent, une répartition juste dans le foyer, et ce qu’il reste à chacun."
  />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="säckli — revenus, dépenses communes et personnelles, et le reste du mois." />
  <meta name="twitter:card" content="summary_large_image" />

  {@html `<script type="application/ld+json">${jsonLd.replace(/</g, '\\u003c')}</script>`}
</svelte:head>

<svelte:window onscroll={() => (scrolled = scrollY > 8)} />

{#snippet cta(extra = '')}
  <!-- La flèche avance au survol : le bouton invite à cliquer sans crier. -->
  <a
    href={primary.href}
    class="group inline-flex items-center gap-2 rounded-control bg-green px-5 py-3 text-[14px] font-bold text-[#143b2b] shadow-[0_8px_20px_-8px_rgba(62,207,142,0.7)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-10px_rgba(62,207,142,0.85)] active:translate-y-0 active:scale-[0.97] {extra}"
  >
    {primary.label}
    <span class="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
  </a>
{/snippet}

{#snippet demoCta(extra = '')}
  <a
    href="/demo"
    class="group inline-flex items-center gap-2 rounded-control border border-line bg-panel px-5 py-3 text-[14px] font-semibold text-[#25302b] transition duration-300 hover:-translate-y-0.5 hover:border-[#bcebd5] hover:text-deep active:scale-[0.97] {extra}"
  >
    Essayer la démo
    <span class="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">→</span>
  </a>
{/snippet}

<div class="min-h-screen overflow-x-clip bg-bg text-[14px] text-fg">
  <header
    class="sticky top-0 z-30 border-b transition-colors duration-300 {scrolled
      ? 'border-line bg-bg/80 backdrop-blur-md'
      : 'border-transparent'}"
  >
    <div class="mx-auto flex max-w-[1040px] items-center gap-4 px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3.5">
      <a href="/" aria-label="Accueil säckli"><Logo /></a>
      <nav class="ml-auto flex items-center gap-1">
        {#if data.signedIn}
          <a href="/budgets" class="rounded-control px-3 py-2 text-[13px] font-semibold text-deep hover:bg-panel">Mes budgets →</a>
        {:else}
          <a href="/demo" class="rounded-control px-3 py-2 text-[13px] text-[#3d4541] hover:bg-panel">Démo</a>
          <a href="/login" class="rounded-control px-3 py-2 text-[13px] text-[#3d4541] hover:bg-panel">Se connecter</a>
          <a
            href="/signup"
            class="rounded-full border border-[#bcebd5] bg-pale px-3.5 py-1.5 text-[13px] font-semibold text-deep transition duration-300 hover:-translate-y-px hover:bg-green hover:text-[#143b2b] max-sm:hidden"
          >
            Créer un budget
          </a>
        {/if}
      </nav>
    </div>
  </header>

  {#if data.deleted}
    <p class="mx-auto mt-0 mb-0 max-w-[1040px] px-5" role="status">
      <span class="block rounded-control border border-[#bcebd5] bg-pale px-3 py-2.5 text-[12.5px] text-deep">
        Votre compte a été supprimé. Merci d'avoir utilisé säckli.
      </span>
    </p>
  {/if}

  <main>
    <section class="relative">
      <!-- Deux halos qui dérivent lentement : de la vie sans rien qui accroche l'œil. -->
      <div class="pointer-events-none absolute inset-x-0 -top-40 h-[760px] overflow-hidden" aria-hidden="true">
        <div class="blob absolute top-[8%] right-[2%] h-[440px] w-[440px] bg-green/25"></div>
        <div class="blob blob-slow absolute top-[38%] right-[30%] h-[320px] w-[320px] bg-[#6fd6c8]/25"></div>
      </div>
      <div class="relative mx-auto grid max-w-[1040px] grid-cols-[1fr_440px] items-center gap-14 px-5 pt-14 pb-24 max-lg:grid-cols-1 max-lg:gap-10 max-sm:pt-8 max-sm:pb-16">
        <div>
          <h1 class="m-0 font-serif text-[clamp(40px,5.4vw,62px)] leading-[1.04] font-medium tracking-[-0.01em] text-[#25302b]">
            <span class="rise block">Votre budget,</span>
            <em class="rise relative inline-block text-deep [animation-delay:120ms]">
              au clair.
              <!-- Le trait se dessine sous les mots, une fois le titre posé. -->
              <svg class="absolute -bottom-2 left-0 h-3 w-full overflow-visible" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                <path
                  class="underline-draw"
                  d="M2 8 C 50 2, 120 2, 198 7"
                  pathLength="1"
                  fill="none"
                  stroke="var(--color-green)"
                  stroke-width="4"
                  stroke-linecap="round"
                />
              </svg>
            </em>
          </h1>
          <p class="rise mt-6 mb-0 max-w-[420px] text-[16px] leading-relaxed text-[#4e5752] [animation-delay:240ms]">
            Seul ou à plusieurs : voyez où part votre argent, partagez équitablement les dépenses communes, et
            sachez ce qu'il reste à chacun.
          </p>
          <div class="rise mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 [animation-delay:360ms]">
            {@render cta()}
            {@render demoCta()}
          </div>
          <p class="rise mt-3 mb-0 text-[12.5px] text-muted [animation-delay:420ms]">
            La démo s'ouvre tout de suite : sans compte, sans email.
          </p>
        </div>
        <div class="rise [animation-delay:300ms] [animation-duration:1s]">
          <HeroDemo />
        </div>
      </div>
    </section>

    <section class="border-t border-line">
      <div class="mx-auto grid max-w-[1040px] grid-cols-3 gap-5 px-5 py-20 max-md:grid-cols-1 max-md:gap-4 max-sm:py-14">
        {#each POINTS as p, i (p.title)}
          <div
            use:reveal={i * 110}
            class="group rounded-card border border-line bg-panel p-6 transition duration-300 hover:-translate-y-1 hover:border-[#bcebd5] hover:shadow-[0_18px_40px_-24px_rgba(22,115,78,0.35)]"
          >
            <span class="num font-serif text-[13px] text-green transition-colors group-hover:text-deep">0{i + 1}</span>
            <h2 class="mt-3 mb-0 font-serif text-[20px] font-medium text-[#34433d]">{p.title}</h2>
            <p class="mt-2 mb-0 text-[13.5px] leading-relaxed text-muted">{p.text}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- La démo comme argument : on ne demande pas de croire, on fait essayer. -->
    <section class="border-t border-line">
      <div class="mx-auto max-w-[1040px] px-5 py-16 max-sm:py-12">
        <a
          use:reveal
          href="/demo"
          class="edge group relative flex items-center gap-8 overflow-hidden rounded-[14px] bg-deep px-8 py-9 text-[#eafaf2] max-md:flex-col max-md:items-start max-md:gap-5 max-sm:px-6 max-sm:py-7"
        >
          <div class="blob pointer-events-none absolute -top-24 -right-16 h-[280px] w-[280px] bg-green/40" aria-hidden="true"></div>
          <div class="relative min-w-0 flex-1">
            <span class="text-[11px] font-bold tracking-[0.12em] text-green uppercase">Sans inscription</span>
            <h2 class="mt-2 mb-0 font-serif text-[clamp(24px,3vw,32px)] leading-tight font-medium text-white">
              Essayez avec un vrai budget, tout de suite.
            </h2>
            <p class="mt-3 mb-0 max-w-[520px] text-[14.5px] leading-relaxed text-[#bfe3d2]">
              Un couple, deux salaires différents, une trentaine de lignes : changez un montant, déplacez une
              répartition, ouvrez l'analyse ou le PDF. Rien n'est enregistré, rien ne vous engage.
            </p>
          </div>
          <span
            class="relative inline-flex shrink-0 items-center gap-2 rounded-control bg-green px-5 py-3 text-[14px] font-bold text-[#143b2b]"
          >
            Ouvrir la démo
            <span aria-hidden="true">→</span>
          </span>
        </a>
      </div>
    </section>

    <section class="border-t border-line">
      <div class="mx-auto grid max-w-[1040px] grid-cols-[1fr_1.1fr] items-center gap-14 px-5 py-20 max-md:grid-cols-1 max-md:gap-8 max-sm:py-14">
        <div use:reveal>
          <h2 class="m-0 font-serif text-[clamp(26px,3vw,32px)] leading-tight font-medium text-[#25302b]">
            À chacun sa juste part.
          </h2>
          <p class="mt-4 mb-0 max-w-[440px] text-[14.5px] leading-relaxed text-[#4e5752]">
            Chaque dépense commune se répartit à votre façon : à parts égales, selon les revenus de chacun, ou au
            curseur. Ou laissez säckli calculer les parts qui laissent à chacun le même reste à la fin du mois.
          </p>
        </div>
        <div use:reveal={150}>
          <SplitDemo />
        </div>
      </div>
    </section>

    <section class="border-t border-line">
      <div class="mx-auto max-w-[1040px] px-5 py-20 max-sm:py-14">
        <div use:reveal>
          <h2 class="m-0 font-serif text-[20px] font-medium text-[#34433d]">Où va l'argent</h2>
          <p class="mt-2 mb-8 max-w-[520px] text-[13.5px] leading-relaxed text-muted">
            Des revenus à chaque dépense : l'épaisseur de chaque flux suit le montant mensuel. Survolez ou touchez un élément pour suivre son chemin.
          </p>
        </div>
        <div use:reveal={120}>
          <FlowDemo />
        </div>
      </div>
    </section>

    <section class="border-t border-line">
      <div class="mx-auto max-w-[1040px] px-5 py-20 max-sm:py-14">
        <h2 use:reveal class="m-0 font-serif text-[20px] font-medium text-[#34433d]">Et aussi</h2>
        <ul class="mt-8 grid list-none grid-cols-3 gap-x-10 gap-y-7 p-0 max-md:grid-cols-2 max-sm:grid-cols-1">
          {#each EXTRAS as f, i (f.title)}
            <li use:reveal={(i % 3) * 90} class="group flex gap-3">
              <span
                class="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-pale text-deep transition duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-green group-hover:text-[#143b2b]"
                aria-hidden="true"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={f.dashed ? '2.5 2.5' : undefined}>
                  <path d={f.icon} />
                </svg>
              </span>
              <div>
                <b class="block text-[13.5px] font-semibold">{f.title}</b>
                <span class="mt-0.5 block text-[13px] leading-relaxed text-muted">{f.text}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="border-t border-line">
      <div class="mx-auto grid max-w-[1040px] grid-cols-[1fr_2fr] gap-10 px-5 py-20 max-md:grid-cols-1 max-md:gap-6 max-sm:py-14">
        <h2 use:reveal class="m-0 font-serif text-[20px] font-medium text-[#34433d]">Questions fréquentes</h2>
        <div use:reveal={100} class="divide-y divide-line border-y border-line">
          {#each FAQ as item (item.q)}
            <details class="group py-4">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-semibold transition-colors hover:text-deep">
                {item.q}
                <span class="text-[18px] leading-none font-normal text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p class="mt-2.5 mb-0 max-w-[560px] text-[13.5px] leading-relaxed text-muted">{item.a}</p>
            </details>
          {/each}
        </div>
      </div>
    </section>

    <section class="relative overflow-hidden border-t border-line bg-pale/60">
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="blob absolute -top-24 left-[12%] h-[300px] w-[300px] bg-green/25"></div>
        <div class="blob blob-slow absolute -bottom-28 right-[10%] h-[340px] w-[340px] bg-[#6fd6c8]/30"></div>
      </div>
      <div use:reveal class="relative mx-auto max-w-[1040px] px-5 py-20 text-center max-sm:py-14">
        <h2 class="m-0 font-serif text-[clamp(26px,3.4vw,36px)] leading-tight font-medium text-[#25302b]">
          Prêt en cinq minutes.
        </h2>
        <p class="mx-auto mt-3 mb-0 max-w-[420px] text-[14.5px] leading-relaxed text-[#4e5752]">
          Les postes courants d'un foyer sont pré-remplis : il ne reste qu'à mettre vos montants.
        </p>
        <div class="mt-7 flex flex-wrap justify-center gap-3">
          {@render cta()}
          {@render demoCta()}
        </div>
      </div>
    </section>
  </main>

  <footer class="border-t border-line pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto flex max-w-[1040px] flex-wrap items-center gap-4 px-5 py-7 text-[12px] text-muted">
      <Logo size={18} text={15} />
      <nav class="ml-auto flex items-center gap-4">
        {#if data.signedIn}
          <a href="/budgets" class="hover:text-deep">Mes budgets</a>
        {:else}
          <a href="/demo" class="hover:text-deep">Démo</a>
          <a href="/login" class="hover:text-deep">Se connecter</a>
          <a href="/signup" class="hover:text-deep">Créer un compte</a>
        {/if}
        <a href="https://github.com/grinlemon/sackli" class="hover:text-deep" rel="noopener" aria-label="Code source sur GitHub" title="Code source sur GitHub">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </nav>
    </div>
  </footer>
</div>

<style>
  .blob {
    border-radius: 9999px;
    filter: blur(70px);
    animation: drift 16s ease-in-out infinite;
    /* Calque à part : le flou n'est calculé qu'une fois, seule sa position
       bouge — c'est ce qui garde la dérive fluide sur un téléphone. */
    will-change: transform;
  }
  .blob-slow {
    animation-duration: 22s;
    animation-direction: reverse;
  }
  /* Au survol, la carte ne change pas : c'est son pourtour qui réagit. Un
     liseré vert se détache du bord et s'écarte de quelques pixels, doublé
     d'une lueur diffuse — l'attention va à la carte sans la toucher. */
  .edge {
    outline: 2px solid transparent;
    outline-offset: 0;
    box-shadow: 0 0 0 0 transparent;
    transition:
      outline-color 0.4s ease,
      outline-offset 0.4s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.4s ease;
  }
  .edge:hover,
  .edge:focus-visible {
    outline-color: rgba(62, 207, 142, 0.55);
    outline-offset: 5px;
    box-shadow: 0 0 36px -4px rgba(62, 207, 142, 0.35);
  }
  .underline-draw {
    stroke-dasharray: 1;
    animation: draw 0.9s cubic-bezier(0.65, 0, 0.35, 1) 0.7s both;
  }
</style>
