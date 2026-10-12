import type { AuthError, EmailOtpType } from '@supabase/supabase-js';

/** Le minimum de l'app, plus strict que celui du projet Supabase (6). */
export const MIN_PASSWORD = 8;

/**
 * Délai imposé par Supabase entre deux emails à la même adresse (`max_frequency`,
 * 60 s par défaut en prod). Le bouton de renvoi l'attend plutôt que de laisser
 * cliquer dans le vide.
 */
export const RESEND_COOLDOWN = 60;

/** Secondes restantes annoncées par Supabase (« …only request this after 42 seconds »), sinon null. */
export function retryAfter(error: Pick<AuthError, 'message'>): number | null {
  const match = /after (\d+) seconds?/i.exec(error.message);
  return match ? Number(match[1]) : null;
}

/**
 * Cible d'une redirection venue de l'URL (`?next=`). Un chemin interne ou rien :
 * `//ailleurs.com` ou `/\ailleurs.com` sont lus par le navigateur comme une
 * autre origine, et un lien de connexion deviendrait un tremplin vers un site
 * qui imite celui-ci.
 */
export function safeNext(next: string | null | undefined, fallback = '/budgets'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/**
 * `redirectTo` des emails d'auth. Construit sur l'origine de la requête : c'est
 * le déploiement réel qui décide du retour, pas la Site URL du dashboard.
 *
 * Porte toujours une query string, et les templates de supabase/templates/
 * comptent dessus : ils ajoutent `&token_hash=…`, pas `?token_hash=…`.
 */
export function emailRedirect(origin: string, next: '/budgets' | '/reset-password'): string {
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

/** Où mène un lien d'email une fois vérifié : un lien de récupération n'a de sens que vers le nouveau mot de passe. */
export function landingFor(type: EmailOtpType | null, next: string | null): string {
  if (type === 'recovery') return '/reset-password';
  return safeNext(next);
}

/** Les messages de Supabase Auth sont en anglais et parlent de l'API, pas à l'utilisateur. */
export function authMessage(error: Pick<AuthError, 'code' | 'message'>): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': {
      const wait = retryAfter(error);
      return wait
        ? `Un email vient déjà de partir. Patientez ${wait} secondes avant d'en redemander un.`
        : 'Trop de demandes en peu de temps. Réessayez dans quelques minutes.';
    }
    // Le SMTP intégré de Supabase n'écrit qu'aux membres de l'organisation : en
    // prod sans SMTP externe, tout autre destinataire est refusé.
    case 'email_address_not_authorized':
      return "L'envoi d'emails vers cette adresse n'est pas encore possible. Contactez-nous, ou réessayez plus tard.";
    case 'weak_password':
      return `Mot de passe trop faible : ${MIN_PASSWORD} caractères minimum.`;
    case 'same_password':
      return "Le nouveau mot de passe doit être différent de l'ancien.";
    case 'email_address_invalid':
      return "Cette adresse email n'est pas valide.";
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cette adresse.';
    case 'signup_disabled':
      return 'Les inscriptions sont fermées.';
    default:
      return error.message;
  }
}
