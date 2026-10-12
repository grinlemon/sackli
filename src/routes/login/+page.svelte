<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';

  let { data, form } = $props();
  let loading = $state(false);
  let sending = $state(false);

  // Une action nommée remplace la query string : on y recolle `?next=`, sans
  // quoi la connexion ne ramènerait plus vers la page demandée.
  const loginAction = $derived(page.url.search ? `${page.url.search}&/login` : '?/login');

  const email = $derived(form?.email ?? data.email);
  const sentAt = $derived(
    form?.resent ? new Date(form.sentAt).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : null
  );
  const notice = $derived(
    form?.resent
      ? `Nouveau lien envoyé à ${form.email} à ${sentAt}. Il peut mettre une minute à arriver : pensez aux spams.`
      : data.notice
  );

  /**
   * Supabase refuse un deuxième email à la même adresse avant 60 s. Le bouton
   * attend avec un décompte, plutôt que de laisser cliquer sans effet visible.
   */
  let now = $state(Date.now());
  const readyAt = $derived(form?.cooldown ? Date.now() + form.cooldown * 1000 : 0);
  const wait = $derived(Math.max(0, Math.ceil((readyAt - now) / 1000)));
  $effect(() => {
    if (!readyAt) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  // Après un renvoi, on garde le bouton : le premier email a pu se perdre aussi.
  const unconfirmed = $derived(Boolean(form?.unconfirmed || form?.resent || data.notice));
</script>

<svelte:head>
  <title>Connexion — säckli</title>
  <meta name="description" content="Connectez-vous à säckli pour retrouver vos budgets." />
</svelte:head>

<AuthCard title="Bon retour" subtitle="Connectez-vous pour retrouver vos budgets." error={form?.error ?? data.error} {notice}>
  <form
    method="POST"
    action={loginAction}
    use:enhance={({ submitter }) => {
      const resending = submitter?.getAttribute('formaction') === '?/resend';
      if (resending) sending = true;
      else loading = true;
      return async ({ update }) => {
        await update({ reset: false });
        loading = sending = false;
        now = Date.now();
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

    {#if unconfirmed}
      <!-- formnovalidate : renvoyer le lien ne demande pas le mot de passe. -->
      <button
        type="submit"
        formaction="?/resend"
        formnovalidate
        disabled={loading || sending || wait > 0}
        class="num mt-2.5 w-full rounded-control border border-line bg-panel px-3 py-2.5 text-[#3d4541] hover:border-green disabled:opacity-60"
      >
        {sending ? 'Envoi…' : wait > 0 ? `Renvoyer dans ${wait} s` : "Renvoyer l'email de confirmation"}
      </button>
    {/if}

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
