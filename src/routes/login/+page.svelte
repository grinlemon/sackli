<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';

  let { data, form } = $props();
  let loading = $state(false);

  // Une action nommée remplace la query string : on y recolle `?next=`, sans
  // quoi la connexion ne ramènerait plus vers la page demandée.
  const loginAction = $derived(page.url.search ? `${page.url.search}&/login` : '?/login');

  const email = $derived(form?.email ?? data.email);
</script>

<svelte:head>
  <title>Connexion — säckli</title>
  <meta name="description" content="Connectez-vous à säckli pour retrouver vos budgets." />
</svelte:head>

<AuthCard title="Bon retour" subtitle="Connectez-vous pour retrouver vos budgets." error={form?.error ?? data.error}>
  <form
    method="POST"
    action={loginAction}
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update({ reset: false });
        loading = false;
      };
    }}
  >
    {#key email}
      <Field label="Email" name="email" type="email" value={email} required autocomplete="email" />
    {/key}
    <Field label="Mot de passe" name="password" type="password" required autocomplete="current-password" />
    <button
      type="submit"
      disabled={loading}
      class="w-full rounded-control bg-green px-3 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-60"
    >
      {loading ? 'Connexion…' : 'Se connecter'}
    </button>

    <p class="mt-4 mb-0 text-center text-[12px]">
      <a href="/forgot-password{email ? `?email=${encodeURIComponent(email)}` : ''}" class="text-muted underline hover:text-deep">
        Mot de passe oublié ?
      </a>
    </p>
  </form>

  {#snippet footer()}
    Pas encore de compte ? <a href="/signup" class="font-medium text-deep underline">Créer un compte</a>
  {/snippet}
</AuthCard>
