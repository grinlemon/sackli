<script lang="ts">
  let { size = 14 }: { size?: number } = $props();
</script>

<!-- Prend la couleur du texte qui l'entoure : le même spinner sert sur fond vert comme sur fond clair. -->
<svg
  class="inline-block shrink-0 animate-spin motion-reduce:animate-none"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
</svg>
