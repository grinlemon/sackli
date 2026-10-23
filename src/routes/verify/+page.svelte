<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { RESEND_COOLDOWN } from '$lib/auth';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';

  let { data, form } = $props();
  let verifying = $state(false);
  let sending = $state(false);

  const email = $derived(form?.email ?? data.email);

  // Une action nommée remplace la query string : on y recolle `?next=`.
  const action = (name: string) => (page.url.search ? `${page.url.search}&/${name}` : `?/${name}`);

  const sentAt = $derived(
    form?.resent ? new Date(form.sentAt).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : null
  );
  const notice = $derived(form?.resent ? `Nouveau code envoyé à ${form.email} à ${sentAt}.` : null);

  /**
   * Supabase refuse un deuxième email à la même adresse avant 60 s. Le bouton
   * attend avec un décompte, plutôt que de laisser cliquer sans effet visible —
   * y compris à l'arrivée, l'inscription venant d'envoyer le premier.
   */
  const start = Date.now();
  let now = $state(Date.now());
  const readyAt = $derived(
    form?.cooldown ? Date.now() + form.cooldown * 1000 : !form && data.sent ? start + RESEND_COOLDOWN * 1000 : 0
  );
  const wait = $derived(Math.max(0, Math.ceil((readyAt - now) / 1000)));
  $effect(() => {
    if (!readyAt) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

</script>

<svelte:head><title>Confirmez votre email — säckli</title></svelte:head>

<AuthCard
  title="Vérifiez vos emails"
  subtitle={data.sent
    ? `Un code à 6 chiffres vient de partir vers ${data.email}. Saisissez-le ici, ou cliquez sur le lien du même email.`
    : `Votre adresse${data.email ? ` ${data.email}` : ''} n'est pas encore confirmée. Saisissez le code à 6 chiffres reçu par email, ou demandez-en un nouveau.`}
  error={form?.error}
  {notice}
>
  <form
    method="POST"
    action={action('verify')}
    use:enhance={({ submitter }) => {
      if (submitter?.getAttribute('formaction') === action('resend')) sending = true;
      else verifying = true;
      return async ({ update }) => {
        await update({ reset: false });
        verifying = sending = false;
        now = Date.now();
      };
    }}
  >
    {#if data.email}
      <input type="hidden" name="email" value={data.email} />
    {:else}
      {#key email}
        <Field label="Email" name="email" type="email" value={email} required autocomplete="email" />
      {/key}
    {/if}

    <label class="mb-4 block">
      <span class="mb-1.5 block text-[12px] font-medium text-[#3d4541]">Code de confirmation</span>
      <!-- svelte-ignore a11y_autofocus : c'est la seule chose à faire sur cette page. -->
      <input
        name="code"
        required
        autofocus
        autocomplete="one-time-code"
        inputmode="numeric"
        maxlength="12"
        placeholder="123456"
        class="num w-full rounded-control border border-line bg-panel px-3 py-2.5 text-center text-[22px] tracking-[0.35em] outline-none focus:border-green focus:ring-2 focus:ring-pale"
      />
    </label>
    <button
      type="submit"
      disabled={verifying}
      class="w-full rounded-control bg-green px-3 py-2.5 font-bold text-[#143b2b] hover:brightness-96 disabled:opacity-60"
    >
      {verifying ? 'Vérification…' : 'Confirmer et continuer'}
    </button>

    <div class="mt-6 border-t border-line pt-5 text-[12px] text-muted">
      <p class="m-0 mb-2 font-medium text-[#3d4541]">Rien reçu ?</p>
      <ul class="m-0 mb-4 list-disc pl-4 leading-relaxed">
        <li>L'email peut mettre une minute à arriver.</li>
        <li>Regardez dans les spams ou l'onglet « Promotions ».</li>
        {#if data.email}
          <li>
            Pas la bonne adresse ?
            <a href="/signup" class="text-deep underline">Recommencer l'inscription</a>
          </li>
        {/if}
      </ul>
      <!-- formnovalidate : renvoyer un code ne demande pas d'en avoir un. -->
      <button
        type="submit"
        formaction={action('resend')}
        formnovalidate
        disabled={sending || wait > 0}
        class="num w-full rounded-control border border-line bg-panel px-3 py-2.5 text-[#3d4541] hover:border-green disabled:opacity-60"
      >
        {sending ? 'Envoi…' : wait > 0 ? `Renvoyer un code dans ${wait} s` : 'Renvoyer un code'}
      </button>
    </div>
  </form>

  {#snippet footer()}
    Déjà confirmé ? <a href="/login" class="font-medium text-deep underline">Se connecter</a>
  {/snippet}
</AuthCard>
