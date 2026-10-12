<script lang="ts">
  import { getDemo } from '$lib/demo/session.svelte';
  import ExportView from '$lib/views/ExportView.svelte';

  const demo = getDemo();
</script>

<ExportView data={demo.data} />
