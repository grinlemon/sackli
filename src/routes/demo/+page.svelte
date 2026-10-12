<script lang="ts">
  import { getDemo } from '$lib/demo/session.svelte';
  import BudgetView from '$lib/views/BudgetView.svelte';

  const demo = getDemo();
</script>

<BudgetView data={demo.data} />
