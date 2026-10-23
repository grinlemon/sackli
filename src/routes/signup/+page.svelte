<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';

  let { form } = $props();
  let loading = $state(false);
</script>

<svelte:head>
  <title>Créer un compte — säckli</title>
  <meta
    name="description"
    content="Créez votre budget säckli en une minute : un email, un mot de passe. Suivez vos dépenses au mois, seul ou à plusieurs."
  />
</svelte:head>

<AuthCard
  title="Créer un compte"
  subtitle="Un email, un mot de passe : vous recevrez un code pour confirmer l'adresse."
  error={form?.error}
>
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
    {#if form && 'exists' in form}
      <p class="-mt-2 mb-4 text-[12px] text-muted">
        <a href="/login?email={encodeURIComponent(form.email)}" class="font-medium text-deep underline">Se connecter</a>
        ou
        <a href="/forgot-password?email={encodeURIComponent(form.email)}" class="text-deep underline">réinitialiser le mot de passe</a>.
      </p>
    {/if}
    <Field label="Prénom (optionnel)" name="display_name" value={form?.displayName ?? ''} placeholder="Alex" autocomplete="name" />
    <Field
      label="Email"
      name="email"
      type="email"
      value={form?.email ?? ''}
      required
      autocomplete="email"
      hint="Si quelqu'un vous a déjà ajouté à son budget avec cette adresse, vous le retrouverez à la connexion."
    />
    <Field label="Mot de passe" name="password" type="password" required autocomplete="new-password" hint="8 caractères minimum." />
    <button
      type="submit"
      disabled={loading}
      class="w-full rounded-control bg-green px-3 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-60"
    >
      {loading ? 'Création…' : 'Créer mon compte'}
    </button>
  </form>

  {#snippet footer()}
    Déjà inscrit ? <a href="/login" class="font-medium text-deep underline">Se connecter</a>
  {/snippet}
</AuthCard>
