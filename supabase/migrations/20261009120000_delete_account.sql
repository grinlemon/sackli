-- Suppression de son propre compte.
--
-- L'application ne détient que la clé anon : elle ne peut pas supprimer un
-- utilisateur d'Auth. Cette fonction le fait pour l'appelant, et pour lui seul
-- (`auth.uid()`), d'où `security definer`.
--
-- Les clés étrangères font déjà l'essentiel en supprimant `auth.users` :
--   - `profiles`             on delete cascade
--   - `budget_members.user_id` on delete set null : dans les budgets des autres,
--     la place reste, « hors compte », et les calculs ne bougent pas ;
--   - `budgets.owner_id`     on delete cascade : un budget possédé disparaît
--     avec toutes ses lignes.
--
-- Ce dernier point ferait perdre aux autres membres un budget qu'ils partagent.
-- On le transmet donc d'abord au membre rattaché suivant, dans l'ordre des
-- membres ; seuls les budgets que personne d'autre n'utilise partent avec le compte.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Non connecté' using errcode = '42501';
  end if;

  update public.budgets b
     set owner_id = (
       select bm.user_id
         from public.budget_members bm
        where bm.budget_id = b.id
          and bm.user_id is not null
          and bm.user_id <> v_uid
        order by bm.position, bm.id
        limit 1
     )
   where b.owner_id = v_uid
     and exists (
       select 1
         from public.budget_members bm
        where bm.budget_id = b.id
          and bm.user_id is not null
          and bm.user_id <> v_uid
     );

  delete from auth.users where id = v_uid;
end;
$fn$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
