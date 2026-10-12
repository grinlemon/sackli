<script lang="ts">
  import BudgetHeader from '$lib/components/BudgetHeader.svelte';

  let { data, children } = $props();
</script>

<BudgetHeader budgetName={data.budget.name} memberCount={data.members.length} />

{@render children()}
