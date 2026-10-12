-- säckli — duplication complète d'un budget
--
-- Copier un budget touche cinq tables liées entre elles par des identifiants.
-- Le faire depuis l'applicatif demanderait une dizaine d'allers-retours sans
-- transaction : une erreur au milieu laisserait un budget à moitié peuplé.
-- D'où une fonction SQL, atomique par construction.
--
-- Les nouveaux identifiants sont **tirés d'avance** dans des tables de
-- correspondance : le remappage devient une jointure au lieu d'une boucle
-- ligne à ligne, et les sous-catégories comme les répartitions retrouvent
-- leurs parents sans ordre d'insertion subtil.

create or replace function public.duplicate_budget(source_id uuid, new_name text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_user uuid := auth.uid();
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'Il faut être connecté pour dupliquer un budget.';
  end if;

  -- security definer : la vérification d'accès ne se fait plus toute seule.
  -- Membre, pas propriétaire : on peut dupliquer un budget qu'on partage.
  if not public.is_budget_member(source_id) then
    raise exception 'Budget introuvable.';
  end if;

  insert into public.budgets (name, owner_id)
  select coalesce(nullif(btrim(new_name), ''), b.name || ' (copie)'), v_user
  from public.budgets b
  where b.id = source_id
  returning id into v_new;

  -- Les triggers ont semé un membre #1 et le jeu de catégories par défaut.
  -- La copie remplace l'un et l'autre : on repart de la source, pas du défaut.
  delete from public.budget_members where budget_id = v_new;
  delete from public.budget_categories where budget_id = v_new;

  create temp table member_map on commit drop as
  select m.id as old, gen_random_uuid() as new
  from public.budget_members m where m.budget_id = source_id;

  create temp table category_map on commit drop as
  select c.id as old, gen_random_uuid() as new
  from public.budget_categories c where c.budget_id = source_id;

  create temp table transaction_map on commit drop as
  select t.id as old, gen_random_uuid() as new
  from public.transactions t where t.budget_id = source_id;

  -- `user_id` suit : la copie est le même foyer, et sans lui les membres déjà
  -- rattachés perdraient l'accès à un budget qu'ils partageaient.
  insert into public.budget_members (id, budget_id, user_id, invite_email, display_name, position)
  select map.new, v_new, m.user_id, m.invite_email, m.display_name, m.position
  from public.budget_members m
  join member_map map on map.old = m.id
  where m.budget_id = source_id;

  -- Racines d'abord : `budget_categories_validate_parent` exige que le parent
  -- existe déjà, et qu'il appartienne au même budget.
  insert into public.budget_categories (id, budget_id, parent_id, name, color, position)
  select map.new, v_new, null, c.name, c.color, c.position
  from public.budget_categories c
  join category_map map on map.old = c.id
  where c.budget_id = source_id and c.parent_id is null;

  insert into public.budget_categories (id, budget_id, parent_id, name, color, position)
  select map.new, v_new, parent.new, c.name, c.color, c.position
  from public.budget_categories c
  join category_map map on map.old = c.id
  join category_map parent on parent.old = c.parent_id
  where c.budget_id = source_id and c.parent_id is not null;

  insert into public.transactions (
    id, budget_id, name, kind, amount, category_id, frequency, member_id, account, position
  )
  select map.new, v_new, t.name, t.kind, t.amount, cat.new, t.frequency, mem.new, t.account, t.position
  from public.transactions t
  join transaction_map map on map.old = t.id
  left join category_map cat on cat.old = t.category_id
  left join member_map mem on mem.old = t.member_id
  where t.budget_id = source_id;

  -- Les répartitions explicites sont la seule chose qu'on ne peut pas
  -- reconstituer : les oublier changerait silencieusement qui paie quoi.
  insert into public.transaction_splits (transaction_id, member_id, weight)
  select tm.new, mm.new, s.weight
  from public.transaction_splits s
  join transaction_map tm on tm.old = s.transaction_id
  join member_map mm on mm.old = s.member_id;

  return v_new;
end;
$fn$;

grant execute on function public.duplicate_budget(uuid, text) to authenticated;
