<script lang="ts">
  import type { FlowSegment } from '$lib/budget/calc';
  import { money, pct } from '$lib/format';

  export interface FlowStyle {
    color: string;
    /** Le segment est assez sombre pour porter du texte clair. */
    dark?: boolean;
  }

  interface Props {
    segments: FlowSegment[];
    /** Couleur par `key` de segment. */
    styles: Record<string, FlowStyle>;
    height?: number;
  }
  let { segments, styles, height = 38 }: Props = $props();

  const fallback: FlowStyle = { color: 'var(--color-seg-b)' };
</script>

<!-- Les étiquettes vivent dans les segments : une barre qui oblige à descendre
     lire une légende pour savoir ce qu'on regarde ne sert à rien. -->
<div
  class="flex w-full overflow-hidden rounded-control border border-line"
  style="height: {height}px"
>
  {#each segments as segment (segment.key)}
    {@const style = styles[segment.key] ?? fallback}
    <div
      class="segment flex min-w-0 items-center gap-1.5 px-2 {style.dark
        ? 'text-[#f4faf7]'
        : 'text-[#1c3027]'}"
      style="width: {segment.percent}%; background: {style.color}"
      title="{segment.label} — {money(segment.amount)} / mois ({pct(segment.percent)})"
    >
      <span class="name truncate text-[11px] font-semibold">{segment.label}</span>
      <span class="amount num truncate text-[11px] opacity-75">{money(segment.amount)}</span>
    </div>
  {/each}
</div>

<style>
  /*
   * Le seuil porte sur la largeur réelle du segment, pas sur son pourcentage :
   * 16 % font 190px sur un panneau large et 30px sur un étroit, et au
   * pourcentage la barre affichait « Perso… CH… » dès que la fenêtre se
   * resserrait — une étiquette tronquée en dit moins que pas d'étiquette.
   *
   * En requête de conteneur plutôt qu'en mesure JS : c'est juste dès le rendu
   * serveur, sans à-coup à l'hydratation, et ça suit le redimensionnement seul.
   */
  .segment {
    container-type: inline-size;
    /* Un montant qui change fait glisser la barre au lieu de la faire sauter. */
    transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .name,
  .amount {
    display: none;
  }
  @container (min-width: 52px) {
    .name {
      display: block;
    }
  }
  @container (min-width: 132px) {
    .amount {
      display: block;
    }
  }
</style>
