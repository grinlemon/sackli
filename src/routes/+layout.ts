import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { supabaseEnv } from '$lib/supabase/env';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
  depends('supabase:auth');
  const { url, key } = supabaseEnv();

  const supabase = isBrowser()
    ? createBrowserClient(url, key, { global: { fetch } })
    : createServerClient(url, key, {
        global: { fetch },
        cookies: { getAll: () => data.cookies }
      });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  return { supabase, session, user: data.user };
};
