<script lang="ts">
  import ExportView from '$lib/views/ExportView.svelte';

  let { data } = $props();
</script>

<ExportView {data} />
