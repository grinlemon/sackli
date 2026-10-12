<script lang="ts">
  // Polices hébergées avec le site plutôt que chez Google Fonts : aucune
  // requête vers un tiers, donc aucune IP de visiteur transmise. Fraunces avec
  // son axe de taille optique (dessin adapté aux grands titres) et son italique,
  // qui porte le « au clair. » de la landing ; Inter en graisse variable.
  import '@fontsource-variable/fraunces/opsz.css';
  import '@fontsource-variable/fraunces/opsz-italic.css';
  import '@fontsource-variable/inter';
  import '../app.css';
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';

  let { data, children } = $props();

  onMount(() => {
    const { data: sub } = data.supabase.auth.onAuthStateChange((_event, newSession) => {
      // Recharge les données serveur dès que la session change d'identité.
      if (newSession?.expires_at !== data.session?.expires_at) invalidate('supabase:auth');
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

{@render children()}
