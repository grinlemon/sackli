import type { Action } from 'svelte/action';

/**
 * Fait apparaître un élément quand il entre à l'écran.
 *
 * Le masquage est posé par l'action, donc seulement une fois le JS chargé :
 * le rendu serveur, un navigateur sans JS ou un robot d'indexation voient la
 * page entière, jamais des blocs restés invisibles. Le style vit dans
 * `app.css` (`[data-reveal]`), qui coupe tout sous `prefers-reduced-motion`.
 *
 * `delay` en ms, pour décaler les éléments d'une même rangée.
 */
export const reveal: Action<HTMLElement, number | undefined> = (node, delay = 0) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  node.dataset.reveal = '';
  node.style.setProperty('--reveal-delay', `${delay}ms`);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        node.dataset.reveal = 'in';
        observer.disconnect();
      }
    },
    { rootMargin: '0px 0px -8% 0px' }
  );
  observer.observe(node);

  return { destroy: () => observer.disconnect() };
};
