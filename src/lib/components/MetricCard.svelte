<script lang="ts">
  interface Props {
    label: string;
    value: string;
    hint: string;
    highlight?: boolean;
  }
  let { label, value, hint, highlight = false }: Props = $props();
</script>

<article
  class="rounded-card border p-4 {highlight ? 'border-[#bcebd5] bg-pale' : 'border-line bg-panel'}"
>
  <span class="block text-[11px] text-muted">{label}</span>
  <strong
    class="num my-2 block font-serif text-[22px] font-medium max-sm:text-[16px] {highlight
      ? 'text-deep'
      : 'text-[#34433d]'}">{value}</strong
  >
  <small class="block text-[11px] text-muted">{hint}</small>
</article>
