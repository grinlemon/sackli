<script lang="ts">
  /**
   * Le chevron des menus déroulants et des groupes repliables. En SVG plutôt
   * qu'en caractère : ⌄ ▾ ▼ ▶ n'ont ni la même taille ni la même ligne de base
   * d'une police à l'autre, et ⌄ tombait sous le texte qu'il accompagne.
   * `open` le retourne, en rotation animée, plutôt que de changer de glyphe.
   */
  interface Props {
    /** Ouvert : pointe vers le haut (ou vers le bas si `collapsible`). */
    open?: boolean;
    /** Groupe repliable : pointe à droite fermé, en bas ouvert. */
    collapsible?: boolean;
    size?: number;
  }
  let { open = false, collapsible = false, size = 14 }: Props = $props();

  const rotation = $derived(collapsible ? (open ? 0 : -90) : open ? 180 : 0);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="shrink-0 transition-transform duration-200"
  style="transform: rotate({rotation}deg)"
  aria-hidden="true"
>
  <path d="M4 6l4 4 4-4" />
</svg>
