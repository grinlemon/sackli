<script lang="ts">
  import { enhance } from '$app/forms';
  import Field from '$lib/components/Field.svelte';
  import Spinner from '$lib/components/Spinner.svelte';

  let { data, form } = $props();
  let panel = $state<'create' | 'import' | null>(null);
  /** Création en cours : le bouton reste inerte, un second clic créerait un second budget. */
  let creating = $state(false);
</script>

<svelte:head><title>Mes budgets — säckli</title></svelte:head>

<header class="flex h-[90px] items-center justify-between gap-3 border-b border-line max-sm:h-auto max-sm:flex-col max-sm:items-stretch max-sm:py-4">
  <div>
    <p class="m-0 mb-1.5 text-[10px] tracking-[0.09em] text-[#8a928e] uppercase">Säckli</p>
    <h1 class="m-0 font-serif text-[28px] font-medium text-[#34433d] max-sm:text-[22px]">Mes budgets</h1>
  </div>
  <div class="flex items-center gap-2 max-sm:[&>button]:min-h-[44px] max-sm:[&>button]:flex-1">
    <button
      class="rounded-control border border-line bg-panel px-3.5 py-2.5 text-[#3d4541] hover:border-green"
      onclick={() => (panel = panel === 'import' ? null : 'import')}
    >
      {panel === 'import' ? 'Annuler' : 'Importer'}
    </button>
    <button
      class="rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96"
      onclick={() => (panel = panel === 'create' ? null : 'create')}
    >
      {panel === 'create' ? 'Annuler' : '＋ Nouveau budget'}
    </button>
  </div>
</header>

<div class="pt-7">
  {#if form?.error}
    <p class="mb-4 rounded-control border border-[#f0d5d3] bg-[#fdf3f2] px-3 py-2.5 text-[12px] text-danger">{form.error}</p>
  {/if}

  {#if panel === 'create'}
    <form
      method="POST"
      action="?/create"
      use:enhance={() => {
        creating = true;
        return async ({ update }) => {
          await update();
          creating = false;
        };
      }}
      class="mb-4 max-w-[520px] rounded-card border border-line bg-panel p-5"
    >
      <h2 class="m-0 mb-4 font-serif text-[19px] font-medium text-[#34433d]">Nouveau budget</h2>
      <Field label="Nom du budget" name="name" required placeholder="Budget familial" />
      <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Field label="Deuxième membre" name="partner_name" placeholder="Sam" />
        <Field label="Son email (optionnel)" name="partner_email" type="email" placeholder="ilona@exemple.ch" />
      </div>
      <p class="-mt-2 mb-4 text-[11px] text-muted">
        Sans email, le membre existe quand même dans les calculs — vous pourrez le rattacher à un compte plus tard.
      </p>
      <label class="mb-4 flex items-center gap-2 text-[12px] text-[#3d4541]">
        <input type="checkbox" name="seed" class="accent-deep" checked />
        Pré-remplir avec les lignes courantes d'un ménage (montants à zéro)
      </label>
      <button
        disabled={creating}
        aria-busy={creating}
        class="inline-flex items-center gap-2 rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-60"
      >
        {#if creating}<Spinner />Création…{:else}Créer le budget{/if}
      </button>
    </form>
  {/if}

  {#if panel === 'import'}
    <form
      method="POST"
      action="?/import"
      enctype="multipart/form-data"
      use:enhance
      class="mb-4 max-w-[520px] rounded-card border border-line bg-panel p-5"
    >
      <h2 class="m-0 mb-4 font-serif text-[19px] font-medium text-[#34433d]">Importer un budget</h2>
      <label class="mb-4 block">
        <span class="mb-1.5 block text-[12px] font-medium text-[#3d4541]">Fichier d'export</span>
        <input
          type="file"
          name="file"
          accept=".json,application/json"
          required
          class="w-full rounded-control border border-line bg-panel px-3 py-2.5 text-[12px] file:mr-3 file:rounded-control file:border-0 file:bg-pale file:px-2.5 file:py-1.5 file:text-deep"
        />
      </label>
      <Field label="Nom (optionnel)" name="name" placeholder="Celui du fichier" />
      <p class="-mt-2 mb-4 text-[11px] text-muted">
        Un nouveau budget est créé, rien n'est remplacé. Vous y prenez la place de qui a exporté ;
        les autres membres le retrouveront en se connectant avec leur email d'invitation.
      </p>
      <button class="rounded-control bg-green px-3.5 py-2.5 font-bold text-[#143b2b] hover:brightness-96">
        Importer le budget
      </button>
    </form>
  {/if}

  {#if data.budgets.length === 0}
    <div class="grid place-items-center rounded-card border border-dashed border-line bg-panel px-6 py-16 text-center">
      <p class="m-0 font-serif text-[17px] text-[#4e5752]">Aucun budget pour l'instant.</p>
      <p class="mt-2 mb-0 text-[12px] text-muted">Créez-en un pour commencer à planifier le mois.</p>
    </div>
  {:else}
    <div class="grid grid-cols-3 gap-2.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
      {#each data.budgets as budget (budget.id)}
        <div class="rounded-card border border-line bg-panel p-5">
          <a href="/budgets/{budget.id}" class="block">
            <h2 class="m-0 font-serif text-[19px] font-medium text-[#34433d]">{budget.name}</h2>
            <p class="mt-1.5 mb-0 text-[11px] text-muted">
              Créé le {new Date(budget.created_at).toLocaleDateString('fr-CH')}
            </p>
          </a>
          <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 max-sm:gap-x-4 max-sm:[&_a]:py-2 max-sm:[&_button]:py-2 max-sm:[&_a]:text-[13px] max-sm:[&_button]:text-[13px]">
            <a href="/budgets/{budget.id}" class="text-[12px] font-medium text-deep">Ouvrir</a>
            <a href="/budgets/{budget.id}/analyse" class="text-[12px] text-muted hover:text-deep">Analyse</a>

            <!-- Dupliquer n'exige pas d'être propriétaire : on peut partir d'un
                 budget qu'on partage pour s'en faire une version à soi. -->
            <form method="POST" action="?/duplicate" use:enhance>
              <input type="hidden" name="id" value={budget.id} />
              <input type="hidden" name="name" value="{budget.name} (copie)" />
              <button class="text-[12px] text-muted hover:text-deep">Dupliquer</button>
            </form>
            <a href="/budgets/{budget.id}/export.json" download class="text-[12px] text-muted hover:text-deep">
              Exporter
            </a>

            {#if budget.owner_id === data.user.id}
              <form method="POST" action="?/remove" use:enhance class="ml-auto">
                <input type="hidden" name="id" value={budget.id} />
                <button
                  class="text-[12px] text-muted hover:text-danger"
                  onclick={(e) => {
                    if (!confirm(`Supprimer « ${budget.name} » et toutes ses lignes ?`)) e.preventDefault();
                  }}
                >
                  Supprimer
                </button>
              </form>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
