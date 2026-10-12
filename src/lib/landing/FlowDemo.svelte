<script lang="ts">
  import { buildSankey } from '$lib/budget/sankey';
  import Sankey from '$lib/components/Sankey.svelte';
  import { DEMO_CATEGORIES, demoHousehold } from './demo';

  const { transactions } = demoHousehold(2);

  // Comme la vue Analyse : trois colonnes demandent 700px, deux tiennent sur un téléphone.
  let narrow = $state(false);
  $effect(() => {
    const query = matchMedia('(max-width: 639.98px)');
    narrow = query.matches;
    const sync = () => (narrow = query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });

  const graph = $derived(buildSankey(transactions, DEMO_CATEGORIES, narrow ? 'roots' : 'children'));
</script>

<Sankey {graph} floor={narrow ? 300 : 700} />
