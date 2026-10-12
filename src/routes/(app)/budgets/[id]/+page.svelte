<script lang="ts">
  import BudgetView from '$lib/views/BudgetView.svelte';

  let { data } = $props();
</script>

<BudgetView {data} />
