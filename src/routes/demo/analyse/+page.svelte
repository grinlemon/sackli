<script lang="ts">
  import { getDemo } from '$lib/demo/session.svelte';
  import AnalyseView from '$lib/views/AnalyseView.svelte';

  const demo = getDemo();
</script>

<AnalyseView data={demo.data} />
