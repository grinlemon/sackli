import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /budgets',
      'Disallow: /account',
      'Disallow: /auth/',
      'Disallow: /reset-password',
      'Disallow: /forgot-password',
      'Disallow: /logout',
      '',
      `Sitemap: ${url.origin}/sitemap.xml`,
      ''
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
