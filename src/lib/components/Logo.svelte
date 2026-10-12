<script lang="ts">
  /**
   * La cascade : revenu, dépenses, reste — trois barres qui raccourcissent.
   * Le même dessin que `static/favicon.svg`, qui ne peut pas lire les tokens
   * et porte donc leurs valeurs en dur : les deux doivent bouger ensemble, avec
   * `favicon.ico` et `apple-touch-icon.png` (régénérés à partir du SVG) et la
   * version `?v=` des liens de `app.html`.
   */
  interface Props {
    /** Côté de l'icône, en px. */
    size?: number;
    /** Le nom à côté de l'icône ; sans lui, l'icône seule (avec un libellé accessible). */
    wordmark?: boolean;
    /** Taille du nom, en px. */
    text?: number;
  }
  let { size = 25, wordmark = true, text = 20 }: Props = $props();
</script>

<span class="inline-flex items-center gap-2">
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    class="shrink-0"
    role={wordmark ? undefined : 'img'}
    aria-hidden={wordmark ? 'true' : undefined}
    aria-label={wordmark ? undefined : 'säckli'}
  >
    <rect x="3" y="5" width="26" height="6" rx="3" fill="var(--color-deep)" />
    <rect x="3" y="13" width="19" height="6" rx="3" fill="var(--color-green)" />
    <rect x="3" y="21" width="11" height="6" rx="3" fill="var(--color-seg-b)" />
  </svg>
  {#if wordmark}
    <span class="font-serif leading-none font-normal text-fg" style="font-size: {text}px">säckli</span>
  {/if}
</span>
