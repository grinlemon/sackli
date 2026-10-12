import { env } from '$env/dynamic/public';

/**
 * Env dynamique (et non statique) pour que l'app builde et démarre sans
 * credentials — l'échec est alors explicite au runtime plutôt qu'au build.
 */
export function supabaseEnv() {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_ANON_KEY sont manquants. Copiez .env.example vers .env.'
    );
  }
  return { url, key };
}
