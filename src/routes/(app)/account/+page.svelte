<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let confirm = $state('');
  let loading = $state(false);

  const matches = $derived(confirm.trim().toLowerCase() === (data.user.email ?? '').toLowerCase());
</script>

<svelte:head><title>Mon compte — säckli</title></svelte:head>

<header class="flex h-[90px] items-center border-b border-line max-sm:h-auto max-sm:py-4">
  <div>
    <p class="m-0 mb-1.5 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">Säckli</p>
    <h1 class="m-0 font-serif text-[28px] font-medium text-[#34433d] max-sm:text-[22px]">Mon compte</h1>
  </div>
</header>

<div class="max-w-[620px] pt-7 pb-10">
  <section class="rounded-card border border-line bg-panel p-5">
    <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">{data.displayName}</h2>
    <p class="mt-1 mb-0 text-[12px] text-muted">{data.user.email}</p>
    <form method="POST" action="/logout" class="mt-4 sm:hidden">
      <button class="min-h-[44px] w-full rounded-control border border-line bg-panel px-3 text-[#3d4541]">
        Se déconnecter
      </button>
    </form>
  </section>

  <section class="mt-2.5 rounded-card border border-[#f0d5d3] bg-panel p-5">
    <h2 class="m-0 font-serif text-[19px] font-medium text-danger">Supprimer mon compte</h2>
    <p class="mt-2 mb-0 text-[12.5px] leading-relaxed text-[#3d4541]">
      La suppression est définitive. Pensez à exporter les budgets que vous voulez garder : depuis
      <a href="/budgets" class="text-deep underline">Mes budgets</a>, « Exporter » télécharge un fichier réimportable.
    </p>

    <ul class="mt-4 mb-0 list-none space-y-3 p-0 text-[12.5px]">
      {#if data.deleted.length}
        <li>
          <b class="text-danger">Supprimés avec le compte</b>, personne d'autre n'y ayant accès :
          <span class="text-[#3d4541]">{data.deleted.map((b) => `« ${b.name} »`).join(', ')}</span>
        </li>
      {/if}
      {#if data.transferred.length}
        <li>
          <b class="text-deep">Transmis</b>, parce que d'autres membres les utilisent :
          <span class="text-[#3d4541]">
            {data.transferred.map((b) => `« ${b.name} » à ${b.heir}`).join(', ')}
          </span>
        </li>
      {/if}
      <li class="text-muted">
        Dans les budgets partagés, votre place reste, sans compte rattaché : les calculs des autres membres ne
        changent pas.
      </li>
    </ul>

    {#if form?.error}
      <p class="mt-4 mb-0 rounded-control border border-[#f0d5d3] bg-[#fdf3f2] px-3 py-2.5 text-[12px] text-danger">
        {form.error}
      </p>
    {/if}

    <form
      method="POST"
      action="?/delete"
      class="mt-5 border-t border-line pt-4"
      use:enhance={() => {
        loading = true;
        return async ({ update }) => {
          await update({ reset: false });
          loading = false;
        };
      }}
    >
      <label class="block">
        <span class="mb-1.5 block text-[12px] text-[#3d4541]">
          Pour confirmer, saisissez votre email : <b class="select-all">{data.user.email}</b>
        </span>
        <input
          name="confirm"
          type="email"
          autocomplete="off"
          bind:value={confirm}
          class="w-full rounded-control border border-line bg-panel px-3 py-2.5 outline-none focus:border-danger"
        />
      </label>
      <button
        type="submit"
        disabled={!matches || loading}
        class="mt-3 rounded-control bg-danger px-3.5 py-2.5 font-bold text-white hover:brightness-110 disabled:opacity-40 max-sm:min-h-[44px] max-sm:w-full"
      >
        {loading ? 'Suppression…' : 'Supprimer définitivement mon compte'}
      </button>
    </form>
  </section>
</div>
