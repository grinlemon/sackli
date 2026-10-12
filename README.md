<div align="center">

<img src="static/favicon.svg" alt="" width="72" height="72" />

# säckli

**Forward-looking budgeting for a household, on your own or together.**

Plan the month's outgoings before they happen, split shared costs fairly,<br />
and let everyone see what they have left.

[![SvelteKit](https://img.shields.io/badge/SvelteKit-Svelte_5-16734e?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-16734e?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-16734e?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_%C2%B7_RLS-16734e?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-adapter-16734e?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)
[![MIT License](https://img.shields.io/badge/license-MIT-3ecf8e?style=flat-square)](LICENSE)

[Features](#features) · [Getting started](#getting-started) · [Deploying](#deploying) · [Under the hood](#under-the-hood)

</div>

---

## Features

- **A budget grid** — every line has an amount, a frequency (monthly or yearly), a category, an assigned member and a split. Optimistic writes, autosave.
- **Slider-based splits** — 50/50, proportional to income, or anything in between: moving one slider rebalances the others so the total stays at 100%.
- **Shared-cost balancing** — a live simulation of what everyone has left if every shared line followed the same split, with a closed-form solution that equalises the remainders to the cent.
- **Analysis** — a per-person waterfall (income → share of shared costs → personal → remaining), the household's income breakdown, and a Sankey diagram from income to categories to individual lines.
- **Export** — an A4 landscape PDF report printed by the browser (vector diagram, zero dependencies), plus JSON export / import to move a budget from one database to another.
- **Sharing** — several members per budget, with or without an account; an invited member gets access on first sign-in, once their email is confirmed.
- **An account-free demo** at `/demo` — a real couple's budget you can edit, saved nowhere.
- **Mobile** — cards and a bottom-sheet editor below 1024px, thumb-friendly tab navigation.

The app's interface is in French.

## The rule that matters

A yearly amount is **first** converted to a monthly one, **then** split.
CHF 1,200/year shared 50/50 is CHF 50 per month per person — not 600.

All calculations live in [`src/lib/budget/calc.ts`](src/lib/budget/calc.ts) as pure functions,
and this rule is locked in by tests. Components display; they never compute.

## Getting started

Requirements: Node 20+, Docker (for the local Supabase stack).

```bash
npm install
npm run db:start       # Postgres + Auth + Studio + Mailpit in Docker
npm run db:status      # prints the local stack's API URL and anon key
cp .env.example .env   # then paste both values in
cp supabase/seed.example.sql supabase/seed.sql
npm run db:reset       # applies migrations and the dev dataset
npm run dev
```

The dev seed creates a ready-to-use account with a fictional couple's budget — credentials at the
top of [`supabase/seed.example.sql`](supabase/seed.example.sql), valid locally only.
`supabase/seed.sql` is git-ignored: you can put your own budget in it without risk of publishing it.

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (auth emails) | http://127.0.0.1:54324 |

Email confirmation is enabled locally just as in production: linking an invited member depends
on it, and turning it off would hide the real flow.

```bash
npm run check   # svelte-check, 0 errors / 0 warnings
npm run test    # vitest
```

## Deploying

The app reads two variables, `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`; the code makes
no distinction between dev and prod, only the environment changes. The `anon` key is public by
design: RLS policies are what protect the data.

1. Create a project on [supabase.com](https://supabase.com) and link it: `npm run db:link`.
   The linked project is production, and only production — so `db:push` can never hit the wrong environment.
2. Apply the schema: `npm run db:push`.
3. On Vercel, set both variables under *Settings → Environment Variables*.
4. In Supabase, *Authentication → URL Configuration*: set the Site URL to your domain, and add
   `https://<your-domain>/**` to the Redirect URLs.
5. Paste the templates from [`supabase/templates/`](supabase/templates/) into
   *Authentication → Emails* (they only apply automatically in local dev).
6. Configure an external SMTP server: Supabase's built-in one only sends to members of your organisation.

Every schema change goes through a migration (`npm run db:new <name>`), never through Studio.

## Under the hood

```
src/lib/budget/calc.ts          calculation rules, pure and tested
src/lib/budget/sankey.ts        Sankey graph and layout
src/lib/budget/filters.ts       grid filtering, sorting and grouping
src/lib/budget/backup.ts        JSON export format and validation
src/lib/budget/state.svelte.ts  grid state, optimistic and debounced writes
src/lib/views/                  Budget · Analysis · Export screens, shared with the demo
src/lib/demo/                   budget and session for the account-free demo
src/routes/(app)/               the app behind sign-in
supabase/migrations/            schema, RLS and SQL functions
```

A few design choices worth knowing:

- **Splits are weights, not percentages** — a share is `weight / Σ weight`. No "sum = 100" constraint to maintain, and no partial write can produce a wrong total. Without an explicit split, the implicit default applies.
- **RLS through `security definer` functions** (`is_budget_member`, `is_budget_owner`…) to avoid recursion between policies.
- **Atomic duplication and import** — `duplicate_budget()` and `import_budget()` are SQL functions: a failure halfway through never leaves a half-populated budget.
- **No third-party requests** — fonts are self-hosted, the PDF is generated by the browser.

The reasoning behind each decision is documented (in French) in [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE) © 2026 Guillaume Trüeb
