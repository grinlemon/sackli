-- säckli — schéma initial
-- À exécuter dans le SQL editor Supabase (ou `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.budgets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index budgets_owner_idx on public.budgets (owner_id);

create table public.budget_members (
  id           uuid primary key default gen_random_uuid(),
  budget_id    uuid not null references public.budgets on delete cascade,
  user_id      uuid references auth.users on delete set null,
  invite_email text,
  display_name text not null,
  position     smallint not null default 1,
  created_at   timestamptz not null default now()
);
create index budget_members_budget_idx on public.budget_members (budget_id);
create unique index budget_members_user_uniq
  on public.budget_members (budget_id, user_id) where user_id is not null;
create index budget_members_invite_idx
  on public.budget_members (lower(invite_email)) where user_id is null;

create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  budget_id  uuid not null references public.budgets on delete cascade,
  name       text not null default '',
  kind       text not null default 'expense' check (kind in ('income', 'expense')),
  amount     numeric(12, 2) not null default 0,
  category   text not null default 'Autre',
  frequency  text not null default 'monthly' check (frequency in ('monthly', 'yearly')),
  -- null = dépense commune ; sinon la ligne est rattachée à ce membre.
  member_id  uuid references public.budget_members on delete set null,
  account    text,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_budget_idx on public.transactions (budget_id, position);

-- weight, pas pct : la part vaut weight / SUM(weight) sur la transaction.
-- Aucune contrainte inter-lignes à maintenir, donc aucun état intermédiaire invalide.
create table public.transaction_splits (
  transaction_id uuid not null references public.transactions on delete cascade,
  member_id      uuid not null references public.budget_members on delete cascade,
  weight         smallint not null default 0 check (weight >= 0),
  primary key (transaction_id, member_id)
);

-- ------------------------------------------------------------- fonctions

-- security definer : lit les tables sans repasser par RLS, ce qui évite la
-- récursion infinie entre les policies de budgets et de budget_members.
create or replace function public.is_budget_member(b uuid)
returns boolean language sql security definer stable set search_path = public as $fn$
  select exists (
    select 1 from budget_members
    where budget_id = b and user_id = auth.uid()
  );
$fn$;

create or replace function public.is_budget_owner(b uuid)
returns boolean language sql security definer stable set search_path = public as $fn$
  select exists (select 1 from budgets where id = b and owner_id = auth.uid());
$fn$;

create or replace function public.can_access_transaction(t uuid)
returns boolean language sql security definer stable set search_path = public as $fn$
  select exists (
    select 1
    from transactions tr
    join budget_members bm on bm.budget_id = tr.budget_id
    where tr.id = t and bm.user_id = auth.uid()
  );
$fn$;

-- Rattache les places laissées en attente pour cette adresse.
-- email_confirmed_at : sans cette garde, s'inscrire avec l'email de quelqu'un
-- d'autre suffirait à entrer dans son budget.
create or replace function public.claim_memberships()
returns void language sql security definer set search_path = public as $fn$
  update budget_members bm
     set user_id = u.id
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null
     and bm.user_id is null
     and lower(bm.invite_email) = lower(u.email)
     and not exists (
       select 1 from budget_members other
       where other.budget_id = bm.budget_id and other.user_id = u.id
     );
$fn$;

-- Le créateur devient membre #1 : impossible de rester dehors de son budget.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into budget_members (budget_id, user_id, display_name, position)
  values (
    new.id,
    new.owner_id,
    coalesce(
      nullif((select display_name from profiles where id = new.owner_id), ''),
      split_part((select email from auth.users where id = new.owner_id), '@', 1),
      'Moi'
    ),
    1
  );
  return new;
end;
$fn$;

create trigger budgets_add_owner
  after insert on public.budgets
  for each row execute function public.add_owner_as_member();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger transactions_touch
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ RLS

alter table public.profiles           enable row level security;
alter table public.budgets            enable row level security;
alter table public.budget_members     enable row level security;
alter table public.transactions       enable row level security;
alter table public.transaction_splits enable row level security;

create policy "profil : lecture de soi" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profil : mise a jour de soi" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "budget : visible par ses membres" on public.budgets
  for select to authenticated
  using (owner_id = auth.uid() or public.is_budget_member(id));
create policy "budget : creation par soi" on public.budgets
  for insert to authenticated with check (owner_id = auth.uid());
create policy "budget : modification par le proprietaire" on public.budgets
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "budget : suppression par le proprietaire" on public.budgets
  for delete to authenticated using (owner_id = auth.uid());

create policy "membres : visibles par le budget" on public.budget_members
  for select to authenticated
  using (public.is_budget_member(budget_id) or public.is_budget_owner(budget_id));
create policy "membres : ajoutes par le proprietaire" on public.budget_members
  for insert to authenticated with check (public.is_budget_owner(budget_id));
create policy "membres : modifies par le proprietaire" on public.budget_members
  for update to authenticated
  using (public.is_budget_owner(budget_id)) with check (public.is_budget_owner(budget_id));
create policy "membres : retires par le proprietaire" on public.budget_members
  for delete to authenticated using (public.is_budget_owner(budget_id));

-- Un budget est partagé : tout membre édite toutes les lignes.
create policy "lignes : acces par les membres" on public.transactions
  for all to authenticated
  using (public.is_budget_member(budget_id))
  with check (public.is_budget_member(budget_id));

create policy "repartitions : acces par les membres" on public.transaction_splits
  for all to authenticated
  using (public.can_access_transaction(transaction_id))
  with check (public.can_access_transaction(transaction_id));

-- --------------------------------------------------------------- grants

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.budgets, public.budget_members,
  public.transactions, public.transaction_splits
  to authenticated;
grant execute on function public.claim_memberships() to authenticated;
