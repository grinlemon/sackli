-- säckli — catégories et sous-catégories par budget
--
-- La liste des catégories était une constante TypeScript : impossible à adapter
-- d'un budget à l'autre, et sans endroit où accrocher une couleur. Elle devient
-- une table, sur deux niveaux exactement (une catégorie, ses sous-catégories).

create table public.budget_categories (
  id         uuid primary key default gen_random_uuid(),
  budget_id  uuid not null references public.budgets on delete cascade,
  -- null = catégorie racine ; sinon sous-catégorie de cette racine.
  parent_id  uuid references public.budget_categories on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  -- La couleur vit sur la racine ; les sous-catégories héritent de sa teinte,
  -- donc en stocker une sur un enfant serait une donnée morte.
  color      text check (color ~ '^#[0-9a-fA-F]{6}$'),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint budget_categories_color_on_root_only
    check ((parent_id is null) = (color is not null))
);

create index budget_categories_budget_idx on public.budget_categories (budget_id, position);
create index budget_categories_parent_idx on public.budget_categories (parent_id);

-- Deux index partiels plutôt qu'un seul : en SQL, `null` n'est jamais égal à
-- `null`, donc une contrainte unique sur (budget_id, parent_id, name) laisserait
-- passer deux racines homonymes.
create unique index budget_categories_root_name_uniq
  on public.budget_categories (budget_id, lower(name)) where parent_id is null;
create unique index budget_categories_child_name_uniq
  on public.budget_categories (parent_id, lower(name)) where parent_id is not null;

-- Deux niveaux, pas un arbre : le parent doit être une racine du même budget.
create or replace function public.budget_categories_validate_parent()
returns trigger language plpgsql as $fn$
declare
  parent public.budget_categories;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into parent from public.budget_categories where id = new.parent_id;
  if parent.id is null then
    raise exception 'Catégorie parente introuvable.';
  end if;
  if parent.budget_id <> new.budget_id then
    raise exception 'La sous-catégorie doit appartenir au même budget que sa catégorie.';
  end if;
  if parent.parent_id is not null then
    raise exception 'Une sous-catégorie ne peut pas en contenir une autre.';
  end if;
  return new;
end;
$fn$;

create trigger budget_categories_validate_parent
  before insert or update on public.budget_categories
  for each row execute function public.budget_categories_validate_parent();

-- ------------------------------------------------- rattachement des lignes

alter table public.transactions
  add column category_id uuid references public.budget_categories on delete set null;
create index transactions_category_idx on public.transactions (category_id);

-- ------------------------------------------------------ jeu par défaut

create or replace function public.seed_default_categories(b uuid)
returns void language sql security definer set search_path = public as $fn$
  insert into budget_categories (budget_id, name, color, position)
  values
    (b, 'Revenu',     '#2f9e6b', 0),
    (b, 'Charge',     '#a1453f', 1),
    (b, 'Economie',   '#3f7fa1', 2),
    (b, 'Loisir',     '#8a5fa8', 3),
    (b, 'Maison',     '#b8763a', 4),
    (b, 'Media',      '#c2557f', 5),
    (b, 'Nourriture', '#6f9e2f', 6),
    (b, 'Transport',  '#2f8fa1', 7),
    (b, 'Autre',      '#6b716e', 8)
  on conflict do nothing;
$fn$;

create or replace function public.add_default_categories()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public.seed_default_categories(new.id);
  return new;
end;
$fn$;

-- Même logique que budgets_add_owner : un budget n'est jamais livré vide.
create trigger budgets_add_categories
  after insert on public.budgets
  for each row execute function public.add_default_categories();

-- ------------------------------------------------------------- reprise

-- 1. le jeu par défaut pour les budgets existants
do $$
declare
  b uuid;
begin
  for b in select id from public.budgets loop
    perform public.seed_default_categories(b);
  end loop;
end;
$$;

-- 2. les valeurs textuelles réellement utilisées qui n'y figurent pas
insert into public.budget_categories (budget_id, name, color, position)
select distinct t.budget_id, btrim(t.category), '#6b716e', 100
from public.transactions t
where btrim(coalesce(t.category, '')) <> ''
  and not exists (
    select 1 from public.budget_categories c
    where c.budget_id = t.budget_id
      and c.parent_id is null
      and lower(c.name) = lower(btrim(t.category))
  );

-- 3. rattachement, puis la colonne texte n'a plus de raison d'être
update public.transactions t
set category_id = c.id
from public.budget_categories c
where c.budget_id = t.budget_id
  and c.parent_id is null
  and lower(c.name) = lower(btrim(coalesce(t.category, '')));

alter table public.transactions drop column category;

-- ----------------------------------------------------------------- RLS

alter table public.budget_categories enable row level security;

-- Un budget est partagé : comme les lignes, les catégories sont éditables par
-- tout membre, pas seulement par le propriétaire.
create policy "categories : acces par les membres" on public.budget_categories
  for all to authenticated
  using (public.is_budget_member(budget_id))
  with check (public.is_budget_member(budget_id));

grant select, insert, update, delete on public.budget_categories to authenticated;
