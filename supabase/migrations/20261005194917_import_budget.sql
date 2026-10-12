-- säckli — import d'un budget depuis un export JSON
--
-- Pendant de duplicate_budget(), pour un budget venu d'une autre base : mêmes
-- cinq tables, même raison d'être une fonction SQL (une seule transaction, pas
-- de budget à moitié peuplé si une ligne est refusée), même remappage par tables
-- de correspondance. Les identifiants du fichier sont des références courtes
-- (`m1`, `c1`…) : chaque objet reçoit ici un nouvel UUID.
--
-- Le format est validé en amont par parseBackup() (src/lib/budget/backup.ts),
-- qui rend des messages lisibles. Les gardes ci-dessous ne servent qu'à ce
-- qu'un appel direct à la RPC ne puisse rien produire d'incohérent.
--
-- `security invoker`, contrairement à duplicate_budget() : rien n'est lu dans un
-- autre budget, donc les policies RLS peuvent faire tout le contrôle d'accès
-- d'elles-mêmes, sans vérification à reproduire à la main.

create or replace function public.import_budget(payload jsonb, new_name text default null)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare
  v_user uuid := auth.uid();
  v_new  uuid;
  v_me   text;
begin
  if v_user is null then
    raise exception 'Il faut être connecté pour importer un budget.';
  end if;
  if payload ->> 'format' is distinct from 'saeckli-budget' or payload -> 'version' <> '1'::jsonb then
    raise exception 'Fichier d''export non reconnu.';
  end if;

  create temp table import_members on commit drop as
  select m.ref, gen_random_uuid() as id, m.display_name, m.invite_email, m.position, coalesce(m.me, false) as me
  from jsonb_to_recordset(payload -> 'members')
    as m(ref text, display_name text, invite_email text, position smallint, me boolean);

  create temp table import_categories on commit drop as
  select c.ref, gen_random_uuid() as id, c.parent, c.name, c.color, c.position
  from jsonb_to_recordset(payload -> 'categories')
    as c(ref text, parent text, name text, color text, position smallint);

  create temp table import_transactions on commit drop as
  select gen_random_uuid() as id, t.*
  from jsonb_to_recordset(payload -> 'transactions')
    as t(name text, kind text, amount numeric, category text, frequency text,
         member text, account text, position integer, splits jsonb);

  create temp table import_splits on commit drop as
  select t.id as transaction_id, s.member, s.weight
  from import_transactions t
  cross join lateral jsonb_to_recordset(coalesce(t.splits, '[]'::jsonb)) as s(member text, weight smallint);

  -- Une jointure perdrait en silence une ligne à la référence pendante : la
  -- catégorie ou le payeur changerait sans que personne le voie.
  if exists (select 1 from import_categories c
             where c.parent is not null and not exists (select 1 from import_categories p where p.ref = c.parent))
     or exists (select 1 from import_transactions t
                where t.category is not null and not exists (select 1 from import_categories c where c.ref = t.category))
     or exists (select 1 from import_transactions t
                where t.member is not null and not exists (select 1 from import_members m where m.ref = t.member))
     or exists (select 1 from import_splits s
                where not exists (select 1 from import_members m where m.ref = s.member))
  then
    raise exception 'Le fichier fait référence à une catégorie ou un membre qu''il ne contient pas.';
  end if;

  -- Qui importe prend la place de qui a exporté ; à défaut, celle du premier
  -- membre. Sans cela, il créerait un budget dont il ne serait pas membre.
  select ref into v_me from import_members order by me desc, position, ref limit 1;
  if v_me is null then
    raise exception 'Le budget doit compter au moins un membre.';
  end if;

  insert into public.budgets (name, owner_id)
  values (
    coalesce(nullif(btrim(new_name), ''), nullif(btrim(payload #>> '{budget,name}'), ''), 'Budget importé'),
    v_user
  )
  returning id into v_new;

  -- Les triggers ont semé un membre #1 et le jeu de catégories par défaut ;
  -- l'import les remplace par ceux du fichier. Catégories d'abord : leur policy
  -- exige d'être membre, ce qu'on cesse d'être un instant en vidant les membres.
  delete from public.budget_categories where budget_id = v_new;
  delete from public.budget_members where budget_id = v_new;

  -- Aucun `user_id` ne voyage : les autres membres repartent sur leur email,
  -- et claim_memberships() les rattachera à leur prochaine connexion.
  insert into public.budget_members (id, budget_id, user_id, invite_email, display_name, position)
  select m.id, v_new, case when m.ref = v_me then v_user end, m.invite_email, m.display_name, m.position
  from import_members m;

  -- Racines d'abord : `budget_categories_validate_parent` exige que le parent
  -- existe déjà.
  insert into public.budget_categories (id, budget_id, parent_id, name, color, position)
  select c.id, v_new, null, c.name, c.color, coalesce(c.position, 0)
  from import_categories c
  where c.parent is null;

  insert into public.budget_categories (id, budget_id, parent_id, name, color, position)
  select c.id, v_new, p.id, c.name, c.color, coalesce(c.position, 0)
  from import_categories c
  join import_categories p on p.ref = c.parent;

  insert into public.transactions (
    id, budget_id, name, kind, amount, category_id, frequency, member_id, account, position
  )
  select t.id, v_new, coalesce(t.name, ''), t.kind, t.amount, c.id, t.frequency, m.id,
         nullif(btrim(t.account), ''), coalesce(t.position, 0)
  from import_transactions t
  left join import_categories c on c.ref = t.category
  left join import_members m on m.ref = t.member;

  insert into public.transaction_splits (transaction_id, member_id, weight)
  select s.transaction_id, m.id, s.weight
  from import_splits s
  join import_members m on m.ref = s.member;

  return v_new;
end;
$fn$;

revoke execute on function public.import_budget(jsonb, text) from public, anon;
grant execute on function public.import_budget(jsonb, text) to authenticated;
