<script lang="ts">
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { money } from '$lib/format';

  /**
   * Un montant qui défile jusqu'à sa nouvelle valeur au lieu de sauter : on
   * voit le reste bouger quand on change un loyer. Le rendu serveur affiche
   * directement la valeur, l'animation ne joue qu'aux changements.
   */
  let { value }: { value: number } = $props();

  const tween = Tween.of(() => value, {
    duration: () => (prefersReducedMotion.current ? 0 : 450),
    easing: cubicOut
  });
</script>

<!-- Arrondi pendant la course, valeur exacte à l'arrivée : pas de centimes qui clignotent. -->
{money(tween.current === value ? value : Math.round(tween.current))}
