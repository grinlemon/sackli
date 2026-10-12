<script lang="ts" module>
  export type NavIconName = 'budget' | 'analyse' | 'settings' | 'export';
</script>

<script lang="ts">
  /**
   * Icônes de navigation, en SVG plutôt qu'en caractères Unicode : ▦ ◒ ⚙ ⎙
   * dépendaient de la police de chaque système — tailles, graisses et
   * alignements dépareillés, et ⚙ rendu en emoji couleur sur iOS. Trait en
   * `currentColor` : l'icône suit l'état actif du lien sans rien de plus.
   */
  interface Props {
    name: NavIconName;
    /** Côté de l'icône, en px. */
    size?: number;
  }
  let { name, size = 18 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="shrink-0"
  aria-hidden="true"
>
  {#if name === 'budget'}
    <!-- Des lignes de budget : une puce, un libellé. -->
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
  {:else if name === 'analyse'}
    <path d="M4 20h16" />
    <path d="M7 16v-4M12 16V8M17 16V5" />
  {:else if name === 'settings'}
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  {:else if name === 'export'}
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" />
  {/if}
</svg>
