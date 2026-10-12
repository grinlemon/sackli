import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { isIndexable } from '$lib/seo';
import { supabaseEnv } from '$lib/supabase/env';

const PROTECTED = ['/budgets', '/account'];

export const handle: Handle = async ({ event, resolve }) => {
  const { url, key } = supabaseEnv();

  event.locals.supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          event.cookies.set(name, value, { ...options, path: '/' });
        }
      }
    }
  });

  /**
   * getSession() ne vérifie pas la signature du JWT : on revalide toujours
   * auprès du serveur Auth avant de considérer quelqu'un comme connecté.
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    if (!session) return { session: null, user: null };

    const {
      data: { user },
      error
    } = await event.locals.supabase.auth.getUser();
    if (error) return { session: null, user: null };

    return { session, user };
  };

  const { session } = await event.locals.safeGetSession();
  if (!session && PROTECTED.some((p) => event.url.pathname.startsWith(p))) {
    redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
  }

  const response = await resolve(event, {
    filterSerializedResponseHeaders: (name) =>
      name === 'content-range' || name === 'x-supabase-api-version'
  });

  // Hors des pages publiques, rien ne doit finir dans un moteur de recherche :
  // un en-tête plutôt qu'une balise par page, pour qu'une page oubliée ne
  // devienne pas indexable par défaut.
  if (!isIndexable(event.url.pathname)) {
    try {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    } catch {
      // En-têtes immuables (réponse relayée telle quelle) : rien à poser.
    }
  }
  return response;
};
