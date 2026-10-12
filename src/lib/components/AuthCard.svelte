<script lang="ts">
  import Logo from '$lib/components/Logo.svelte';
  interface Props {
    title: string;
    subtitle: string;
    error?: string | null;
    notice?: string | null;
    children: import('svelte').Snippet;
    footer: import('svelte').Snippet;
  }
  let { title, subtitle, error = null, notice = null, children, footer }: Props = $props();
</script>

<div class="grid min-h-screen place-items-center bg-bg px-4 py-10">
  <div class="w-full max-w-[380px]">
    <a href="/" class="mb-6 inline-flex" aria-label="Accueil säckli"><Logo /></a>

    <div class="rounded-card border border-line bg-panel p-7">
      <h1 class="m-0 font-serif text-[24px] font-medium text-[#34433d]">{title}</h1>
      <p class="mt-2 mb-6 text-[13px] text-muted">{subtitle}</p>

      {#if error}
        <p class="mb-4 rounded-control border border-[#f0d5d3] bg-[#fdf3f2] px-3 py-2.5 text-[12px] text-danger">
          {error}
        </p>
      {/if}
      {#if notice}
        <p class="mb-4 rounded-control border border-[#bcebd5] bg-pale px-3 py-2.5 text-[12px] text-deep">
          {notice}
        </p>
      {/if}

      {@render children()}
    </div>

    <p class="mt-5 text-center text-[12px] text-muted">{@render footer()}</p>
  </div>
</div>
