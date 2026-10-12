<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';

  let { data, form } = $props();
  let loading = $state(false);
</script>

<svelte:head><title>Mot de passe oublié — säckli</title></svelte:head>

<AuthCard
  title="Mot de passe oublié"
  subtitle="Indiquez votre email : vous recevrez un lien pour en choisir un nouveau."
  error={form?.error ?? data.error}
  notice={form?.sent
    ? `Si un compte existe pour ${form.email}, un lien vient d'y être envoyé. Il est valable une heure.`
    : null}
>
  <form
    method="POST"
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update({ reset: false });
        loading = false;
      };
    }}
  >
    <Field label="Email" name="email" type="email" value={form?.email ?? data.email} required autocomplete="email" />
    <button
      type="submit"
      disabled={loading}
      class="w-full rounded-control bg-green px-3 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-60"
    >
      {loading ? 'Envoi…' : form?.sent ? 'Renvoyer le lien' : 'Envoyer le lien'}
    </button>
  </form>

  {#snippet footer()}
    <a href="/login" class="font-medium text-deep underline">Retour à la connexion</a>
  {/snippet}
</AuthCard>
