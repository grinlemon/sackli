import { describe, expect, it } from 'vitest';
import { authMessage, emailRedirect, landingFor, otpCode, retryAfter, safeNext, verifyUrl } from './auth';

describe('safeNext', () => {
  it('laisse passer un chemin interne', () => {
    expect(safeNext('/budgets/abc/analyse')).toBe('/budgets/abc/analyse');
  });

  it("refuse tout ce qu'un navigateur lirait comme une autre origine", () => {
    for (const next of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '']) {
      expect(safeNext(next)).toBe('/budgets');
    }
    expect(safeNext(null)).toBe('/budgets');
  });
});

describe('landingFor', () => {
  it('envoie un lien de récupération vers le nouveau mot de passe, quoi que dise `next`', () => {
    expect(landingFor('recovery', '/budgets/x')).toBe('/reset-password');
  });

  it('suit `next` pour une confirmation, sans le croire sur parole', () => {
    expect(landingFor('email', '/budgets/x')).toBe('/budgets/x');
    expect(landingFor('email', '//evil.com')).toBe('/budgets');
  });
});

describe('authMessage', () => {
  it('traduit les erreurs courantes', () => {
    expect(authMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }))
      .toContain('Réessayez');
  });

  it('annonce le délai restant quand Supabase le donne', () => {
    const error = {
      code: 'over_email_send_rate_limit',
      message: 'For security purposes, you can only request this after 42 seconds.'
    };
    expect(retryAfter(error)).toBe(42);
    expect(authMessage(error)).toContain('42 secondes');
  });

  it("explique le refus du SMTP intégré au lieu de le rendre en anglais", () => {
    expect(authMessage({ code: 'email_address_not_authorized', message: 'Email address not authorized' }))
      .not.toContain('authorized');
  });

  it("rend le message d'origine plutôt que rien", () => {
    expect(authMessage({ code: 'unexpected', message: 'boom' })).toBe('boom');
  });
});

describe('emailRedirect', () => {
  it('porte déjà une query string, à laquelle les templates ajoutent `&token_hash=`', () => {
    expect(emailRedirect('https://saeckli.vercel.app', '/reset-password'))
      .toBe('https://saeckli.vercel.app/auth/confirm?next=%2Freset-password');
  });
});

describe('otpCode', () => {
  it('accepte un code collé avec ses espaces', () => {
    expect(otpCode(' 123 456 ')).toBe('123456');
    expect(otpCode('123-456')).toBe('123456');
  });

  it("refuse ce qui n'est pas un code", () => {
    for (const input of ['', '12345', 'abcdef', '12345678901']) expect(otpCode(input)).toBeNull();
  });
});

describe('verifyUrl', () => {
  it("garde l'adresse et une destination sûre", () => {
    expect(verifyUrl('a+b@x.ch', { next: '//evil.com', sent: true }))
      .toBe('/verify?email=a%2Bb%40x.ch&next=%2Fbudgets&sent=1');
    expect(verifyUrl('a@x.ch')).toBe('/verify?email=a%40x.ch');
  });
});
