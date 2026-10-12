<script lang="ts">
  import {
    ellipsize,
    fitScale,
    layoutSankey,
    onPath,
    upstream,
    type LayoutOptions,
    type SankeyGraph
  } from '$lib/budget/sankey';
  import { amount, money, shareOfTotal } from '$lib/format';

  interface Props {
    graph: SankeyGraph;
    /**
     * Largeur imposée. L'export s'en sert pour rendre à la taille exacte de la
     * page : une mesure du conteneur ne survivrait pas au passage à
     * l'impression, où la fenêtre n'a plus rien à voir avec la feuille.
     */
    width?: number;
    options?: Partial<Omit<LayoutOptions, 'width'>>;
    /**
     * Hauteur à ne pas dépasser. Au-delà, le dessin est réduit d'un bloc plutôt
     * que coupé — c'est ce qui évite qu'un saut de page tranche les rubans.
     */
    maxHeight?: number;
    /** Montants en francs, ou en part du revenu. */
    unit?: 'chf' | 'percent';
    /** Largeur sous laquelle le conteneur défile plutôt que d'écraser le dessin. */
    floor?: number;
  }
  let { graph, width, options, maxHeight, unit = 'chf', floor = 700 }: Props = $props();

  /**
   * Le diagramme se dessine en pixels réels plutôt que dans un viewBox mis à
   * l'échelle : les étiquettes doivent garder leur taille de lecture quelle que
   * soit la largeur. En dessous du plancher, le conteneur défile.
   */
  let available = $state(0);
  const layout = $derived(
    layoutSankey(graph, { ...options, width: width ?? Math.max(available, floor) })
  );
  const scale = $derived(fitScale(layout.height, maxHeight));

  const AMOUNT_MIN_ROOM = 30;

  /** Une ligne annuelle de quelques francs vaut moins d'un franc par mois :
      l'arrondi afficherait « 0 », ce qui se lit comme une erreur. */
  const figureOf = (value: number) =>
    unit === 'percent'
      ? shareOfTotal(value, graph.total)
      : value > 0 && value < 0.5
        ? '<1'
        : amount(value);

  /**
   * Sélection : un élément et tout ce qui le précède jusqu'aux revenus restent
   * lisibles, le reste s'estompe. Le survol suit la souris ; un clic (ou un
   * toucher, seul geste disponible sur téléphone) fige la sélection, et un
   * second clic, un clic dans le vide ou Échap la retire.
   *
   * Le survol ne compte que pour une souris : sur écran tactile, le navigateur
   * simule un survol au toucher qui ne repart jamais, et un second toucher ne
   * pourrait plus désélectionner.
   */
  let hovered = $state<string | null>(null);
  let pinned = $state<string | null>(null);
  const path = $derived(upstream(graph, hovered ?? pinned));
  const selecting = $derived(path.size > 0);

  const hover = (id: string | null) => (e: PointerEvent) => {
    if (e.pointerType === 'mouse') hovered = id;
  };
  function toggle(id: string) {
    pinned = pinned === id ? null : id;
    if (pinned === null) hovered = null;
  }

  function parts(label: string, value: number, room: number) {
    const figure = figureOf(value);
    const forAmount = figure.length * 5.9 + 7;
    // Le montant ne s'affiche que s'il reste de quoi lire le nom à côté.
    const tight = room - forAmount < AMOUNT_MIN_ROOM;
    return { name: ellipsize(label, tight ? room : room - forAmount), figure: tight ? '' : figure };
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (pinned = hovered = null)} />

<!-- Un clic dans le vide retire la sélection. Les éléments du diagramme
     arrêtent la propagation de leurs propres clics. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overflow-x-auto" bind:clientWidth={available} onclick={() => (pinned = hovered = null)}>
  {#if layout.nodes.length === 0}
    <p class="py-12 text-center text-[12px] text-muted">
      Rien à tracer : ajoutez un revenu ou une dépense dans le budget.
    </p>
  {:else}
    <svg
      width={layout.width * scale}
      height={layout.height * scale}
      viewBox="0 0 {layout.width} {layout.height}"
      role="img"
      aria-label="Diagramme de flux des revenus vers les dépenses, par catégorie puis par ligne"
    >
      <!-- Les rubans d'abord : les nœuds et les étiquettes se posent dessus. -->
      <!-- Un ruban sélectionne ce vers quoi il coule : c'est souvent la cible la
           plus large, quand le nœud d'une petite ligne ne fait qu'un pixel. Au
           clavier, ce sont les nœuds qui portent la sélection. -->
      {#each layout.links as link, i (i)}
        {@const lit = onPath(path, link)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <path
          class="ribbon"
          class:lit={selecting && lit}
          class:dim={selecting && !lit}
          d={link.path}
          fill={link.color}
          onpointerenter={hover(link.target)}
          onpointerleave={hover(null)}
          onclick={(e) => {
            e.stopPropagation();
            toggle(link.target);
          }}
        />
      {/each}

      {#each layout.nodes as node (node.id)}
        {@const selectable = node.kind !== 'income'}
        <!-- tabindex et role="button" vont toujours ensemble ; seuls les
             Revenus, point de départ de tout chemin, ne se sélectionnent pas. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <rect
          class="node"
          class:dim={selecting && !path.has(node.id)}
          class:selectable
          x={node.x0}
          y={node.y0}
          width={node.x1 - node.x0}
          height={node.y1 - node.y0}
          fill={node.color}
          rx="1.5"
          role={selectable ? 'button' : undefined}
          tabindex={selectable ? 0 : undefined}
          aria-pressed={selectable ? pinned === node.id : undefined}
          aria-label={selectable ? `${node.label}, ${money(node.value)} par mois` : undefined}
          onpointerenter={selectable ? hover(node.id) : undefined}
          onpointerleave={selectable ? hover(null) : undefined}
          onfocus={selectable ? () => (hovered = node.id) : undefined}
          onblur={selectable ? () => (hovered = null) : undefined}
          onclick={selectable
            ? (e) => {
                e.stopPropagation();
                toggle(node.id);
              }
            : undefined}
          onkeydown={selectable
            ? (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                toggle(node.id);
              }
            : undefined}
        >
          <!-- L'infobulle donne toujours les deux : une part sans son montant
               ne dit pas de combien on parle. -->
          <title
            >{node.label} — {node.value < 0.5 ? 'moins de CHF 1' : money(node.value)} / mois ({shareOfTotal(
              node.value,
              graph.total
            )} du revenu)</title
          >
        </rect>
      {/each}

      <!-- Les traits de rappel avant les étiquettes : ils rattachent au bon nœud
           celles qui ont dû s'écarter pour rester lisibles. -->
      {#each layout.nodes as node (node.id)}
        {#if node.leader && node.labelRoom > 20}
          <path
            class="leader"
            class:dim={selecting && !path.has(node.id)}
            d="M{node.x1},{(node.y0 + node.y1) / 2}L{node.labelX - 2},{node.labelY}"
            stroke={node.color}
          />
        {/if}
      {/each}

      {#each layout.nodes as node (node.id)}
        {#if node.labelRoom > 20}
          {@const text = parts(node.label, node.value, node.labelRoom)}
          <!-- L'étiquette est une cible aussi : bien plus facile à viser que le
               nœud d'une ligne à quelques francs. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <text
            class="label"
            class:dim={selecting && !path.has(node.id)}
            class:selectable={node.kind !== 'income'}
            onpointerenter={node.kind !== 'income' ? hover(node.id) : undefined}
            onpointerleave={node.kind !== 'income' ? hover(null) : undefined}
            onclick={node.kind !== 'income'
              ? (e) => {
                  e.stopPropagation();
                  toggle(node.id);
                }
              : undefined}
            x={node.labelX}
            y={node.labelY}
            dominant-baseline="central"
            font-size="11"
          >
            <tspan class={node.kind === 'leaf' ? '' : 'strong'}>{text.name}</tspan>
            {#if text.figure}
              <tspan class="figure" dx="5">{text.figure}</tspan>
            {/if}
          </text>
        {/if}
      {/each}
    </svg>
  {/if}
</div>

<style>
  .ribbon {
    opacity: 0.85;
    cursor: pointer;
    transition: opacity 150ms;
  }
  .ribbon.lit {
    opacity: 1;
  }
  .ribbon.dim {
    opacity: 0.12;
  }
  .node,
  .label {
    transition: opacity 150ms;
  }
  .node.dim,
  .leader.dim {
    opacity: 0.2;
  }
  .label.dim {
    opacity: 0.3;
  }
  .selectable {
    cursor: pointer;
  }
  /* Le contour du navigateur suit aussi un clic ; on ne garde qu'un liseré,
     et seulement pour qui navigue au clavier. */
  .node:focus {
    outline: none;
  }
  .node:focus-visible {
    stroke: var(--color-fg);
    stroke-width: 1.5;
  }
  /* Le liseré de la couleur du panneau détache le texte des rubans qu'il croise,
     sans avoir à ménager une gouttière vide dans la mise en page. */
  .label {
    fill: var(--color-fg);
    paint-order: stroke;
    stroke: var(--color-panel);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .leader {
    fill: none;
    stroke-width: 1;
    opacity: 0.55;
  }
  .strong {
    font-weight: 600;
  }
  .figure {
    fill: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
