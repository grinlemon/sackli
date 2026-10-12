<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props {
    label: string;
    name: string;
    type?: string;
    value?: string;
    required?: boolean;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    placeholder?: string;
    hint?: string;
  }
  let {
    label, name, type = 'text', value = '', required = false,
    autocomplete, placeholder, hint
  }: Props = $props();
</script>

<label class="mb-4 block">
  <span class="mb-1.5 block text-[12px] font-medium text-[#3d4541]">{label}</span>
  <input
    {name} {type} {required} {autocomplete} {placeholder}
    defaultValue={value}
    class="w-full rounded-control border border-line bg-panel px-3 py-2.5 outline-none focus:border-green focus:ring-2 focus:ring-pale"
  />
  {#if hint}<span class="mt-1.5 block text-[11px] text-muted">{hint}</span>{/if}
</label>
