<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';
  import { MIN_PASSWORD } from '$lib/auth';

  let { data, form } = $props();
  let loading = $state(false);
</script>

<svelte:head><title>Nouveau mot de passe — säckli</title></svelte:head>

<AuthCard title="Nouveau mot de passe" subtitle="Pour le compte {data.email}." error={form?.error}>
  <form
    method="POST"
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update();
        loading = false;
      };
    }}
  >
    <!-- Le gestionnaire de mots de passe sait ainsi à quel compte rattacher le nouveau. -->
    <input type="email" name="username" value={data.email} autocomplete="username" hidden readonly />
    <Field
      label="Nouveau mot de passe"
      name="password"
      type="password"
      required
      autocomplete="new-password"
      hint="{MIN_PASSWORD} caractères minimum."
    />
    <Field label="Confirmer" name="confirm" type="password" required autocomplete="new-password" />
    <button
      type="submit"
      disabled={loading}
      class="w-full rounded-control bg-green px-3 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-60"
    >
      {loading ? 'Enregistrement…' : 'Enregistrer et continuer'}
    </button>
  </form>

  {#snippet footer()}
    <a href="/budgets" class="font-medium text-deep underline">Garder l'ancien et continuer</a>
  {/snippet}
</AuthCard>
