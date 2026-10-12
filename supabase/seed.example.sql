-- säckli — jeu de développement (local uniquement)
--
-- Modèle : copier en `supabase/seed.sql` (ignoré par git) et l'adapter à son
-- propre budget. `cp supabase/seed.example.sql supabase/seed.sql`
--
-- Joué par `npm run db:reset` via [db.seed] dans config.toml. `db:push`
-- n'applique que les migrations : ce fichier ne part donc jamais en prod.
-- Deuxième garde en tête du bloc : il refuse de semer une base qui contient
-- déjà d'autres comptes, au cas où un `db reset` viserait un jour le projet lié.
--
-- Un budget de couple réaliste mais fictif : il sert à avoir un écran plein en
-- dev. Ses identifiants sont publics : ils ne valent que pour le stack local.
-- Le budget proposé aux nouveaux comptes est ailleurs, dans
-- src/lib/budget/seed.ts, et n'a aucun montant.

do $$
declare
  dev_id       uuid := '00000000-0000-4000-8000-5ac511000001';
  dev_email    text := 'dev@sackli.local';
  dev_password text := 'sackli-dev';
  v_budget     uuid;
  v_me         uuid;
  v_partner    uuid;
  v_added     integer;
begin
  if exists (select 1 from auth.users where id <> dev_id) then
    raise notice 'seed ignoré : la base contient déjà des comptes.';
    return;
  end if;

  if exists (select 1 from auth.users where id = dev_id) then
    raise notice 'seed ignoré : le compte de dev existe déjà.';
    return;
  end if;

  -- email_confirmed_at renseigné : claim_memberships() en dépend, et on ne
  -- veut pas passer par Mailpit à chaque reset.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', dev_id, 'authenticated', 'authenticated',
    dev_email, extensions.crypt(dev_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', 'Alex'), now(), now(),
    '', '', '', ''
  );

  -- Sans identité, GoTrue ne reconnaît pas la connexion par mot de passe.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), dev_id, dev_id::text, 'email',
    jsonb_build_object(
      'sub', dev_id::text, 'email', dev_email,
      'email_verified', true, 'phone_verified', false
    ),
    now(), now(), now()
  );

  -- Les triggers font le reste : budgets_add_owner crée le membre #1,
  -- budgets_add_categories sème les catégories racines.
  insert into public.budgets (name, owner_id)
  values ('Budget famille', dev_id)
  returning id into v_budget;

  select id into v_me from public.budget_members
   where budget_id = v_budget and user_id = dev_id;

  insert into public.budget_members (budget_id, display_name, position)
  values (v_budget, 'Sam', 2)
  returning id into v_partner;

  -- Le trigger a semé le jeu par défaut. Le budget de dev s’en écarte sur un seul
  -- point, assumé : « Impôts & taxes » et « Épargne & réserves » y sont réunis
  -- sous une racine « Économie », qui récupère donc l'épargne et les réserves.
  update public.budget_categories
     set name = 'Économie'
   where budget_id = v_budget and parent_id is null and name = 'Impôts & taxes';

  delete from public.budget_categories
   where budget_id = v_budget and parent_id is null and name = 'Épargne & réserves';

  insert into public.budget_categories (budget_id, parent_id, name, position)
  select v_budget, racine.id, s.name, s.position
  from (values
    ('Économie',  'Epargne',  2),
    ('Économie',  'Réserves', 3),
    ('Transport', 'Leasing',  4)
  ) as s(racine, name, position)
  join public.budget_categories racine
    on racine.budget_id = v_budget and racine.parent_id is null and racine.name = s.racine;

  -- Même exigence que pour les lignes plus bas : une sous-catégorie dont la
  -- racine aurait disparu du jeu par défaut ne s'insérerait pas, et sans ligne
  -- pour la trahir son absence passerait inaperçue.
  get diagnostics v_added = row_count;
  if v_added <> 3 then
    raise exception 'seed : % sous-catégorie(s) ajoutée(s) sur 3 — une racine du jeu par défaut a changé de nom.', v_added;
  end if;

  -- La trame passe par une table temporaire parce qu'elle doit être lue deux
  -- fois : une fois pour vérifier que chaque catégorie qu'elle nomme existe
  -- vraiment, une fois pour insérer.
  create temp table trame (
    position int, name text, kind text, amount numeric,
    category text, sub text, frequency text, owner text, account text
  ) on commit drop;

  insert into trame values
    ( 0, 'Salaire'              , 'income',  6200, 'Revenu'      , 'Salaire'                     , 'monthly', 'a' , 'Raiffeisen'),
    ( 1, 'Salaire'              , 'income',  4800, 'Revenu'      , 'Salaire'                     , 'monthly', 'b' , 'Raiffeisen'),
    ( 2, 'Impôts'               , 'expense', 14000, 'Économie'    , 'Impôts'                      , 'yearly', null, 'Yuh'),
    ( 3, 'Assurance maladie'    , 'expense',   480, 'Santé'       , 'Assurance maladie'           , 'monthly', 'a' , 'Raiffeisen'),
    ( 4, 'Assurance maladie'    , 'expense',   455, 'Santé'       , 'Assurance maladie'           , 'monthly', 'b' , 'Raiffeisen'),
    ( 5, 'Réserve charges'      , 'expense',   960, 'Économie'    , 'Réserves'                    , 'yearly', null, 'Yuh'),
    ( 6, 'Billag'               , 'expense',    28, 'Abonnements' , 'Streaming & médias'          , 'monthly', null, 'Yuh'),
    ( 7, 'Taxe déchets'         , 'expense',    90, 'Économie'    , 'Taxes'                       , 'yearly', null, 'Yuh'),
    ( 8, 'Véto chat'            , 'expense',    50, 'Économie'    , 'Réserves'                    , 'monthly', null, 'Yuh'),
    ( 9, 'Réserve maladie'      , 'expense',   200, 'Santé'       , 'Franchise & réserves'        , 'monthly', null, 'Yuh'),
    (10, 'Investissement bourse', 'expense',   100, 'Économie'    , 'Epargne'                     , 'monthly', 'a' , 'Yuh'),
    (11, 'Vacances'             , 'expense',   400, 'Loisirs'     , 'Vacances'                    , 'monthly', null, 'Yuh'),
    (12, 'Fitness'              , 'expense',    49, 'Loisirs'     , 'Sport'                       , 'monthly', 'b' , null),
    (13, 'Disney+'              , 'expense',    15, 'Abonnements' , 'Streaming & médias'          , 'monthly', null, 'Yuh'),
    (14, 'IPTV'                 , 'expense',    10, 'Abonnements' , 'Streaming & médias'          , 'monthly', null, 'Yuh'),
    (15, 'Crunchyroll'          , 'expense',     9, 'Abonnements' , 'Streaming & médias'          , 'monthly', null, 'Yuh'),
    (16, 'Fitness'              , 'expense',    49, 'Loisirs'     , 'Sport'                       , 'monthly', 'a' , 'Raiffeisen'),
    (17, 'Loyer'                , 'expense',  1850, 'Logement'    , 'Loyer'                       , 'monthly', null, 'Raiffeisen'),
    (18, 'Lessive'              , 'expense',    40, 'Logement'    , 'Entretien'                   , 'monthly', null, 'Yuh'),
    (19, 'Electricité'          , 'expense',    40, 'Logement'    , 'Énergie'                     , 'monthly', null, 'Yuh'),
    (20, 'Assurance ménage'     , 'expense',    37, 'Logement'    , 'Assurances logement'         , 'monthly', null, 'Yuh'),
    (21, 'Caution appartement'  , 'expense',    17, 'Logement'    , 'Assurances logement'         , 'monthly', null, 'Yuh'),
    (22, 'ECA'                  , 'expense',     5, 'Logement'    , 'Assurances logement'         , 'monthly', null, 'Yuh'),
    (23, 'Internet'             , 'expense',    42, 'Abonnements' , 'Télécom'                     , 'monthly', null, 'Raiffeisen'),
    (24, 'Abonnement téléphone' , 'expense',    20, 'Abonnements' , 'Télécom'                     , 'monthly', 'b' , null),
    (25, 'Abonnement téléphone' , 'expense',    36, 'Abonnements' , 'Télécom'                     , 'monthly', 'a' , 'Raiffeisen'),
    (26, 'Courses'              , 'expense',   800, 'Alimentation', 'Courses'                     , 'monthly', null, 'Yuh'),
    (27, 'Essence voiture'      , 'expense',   100, 'Transport'   , 'Carburant'                   , 'monthly', 'a' , 'Yuh'),
    (28, 'Panne voitures'       , 'expense',   200, 'Transport'   , 'Entretien & réparations'     , 'monthly', null, 'Yuh'),
    (29, 'Essence voiture'      , 'expense',   150, 'Transport'   , 'Carburant'                   , 'monthly', 'b' , null),
    (30, 'Assurance voiture'    , 'expense',   140, 'Transport'   , 'Assurances & plaques'        , 'monthly', 'b' , null),
    (31, 'Parking travail'      , 'expense',   100, 'Transport'   , 'Transports publics & parking', 'monthly', 'b' , null),
    (32, 'Assurance voiture'    , 'expense',    60, 'Transport'   , 'Assurances & plaques'        , 'monthly', 'a' , 'Yuh'),
    (33, 'Plaque voiture'       , 'expense',    17, 'Transport'   , 'Assurances & plaques'        , 'monthly', 'b' , null),
    (34, 'Plaque voiture'       , 'expense',    10, 'Transport'   , 'Assurances & plaques'        , 'monthly', 'a' , 'Yuh'),
    (35, 'Épargne commune'      , 'expense',   300, 'Économie'    , 'Epargne'                     , 'monthly', null, 'Yuh'),
    (36, 'Restaurant'           , 'expense',   100, 'Alimentation', 'Restaurants & take-away'     , 'monthly', null, 'Yuh'),
    (37, 'Repas de midi'        , 'expense',   250, 'Alimentation', 'Restaurants & take-away'     , 'monthly', 'a' , 'Yuh'),
    (38, 'Repas de midi'        , 'expense',   150, 'Alimentation', 'Restaurants & take-away'     , 'monthly', 'b' , null);

  -- Sans cette garde, un nom de catégorie qui a changé ferait silencieusement
  -- retomber la ligne sur sa racine — le `coalesce` ci-dessous est un filet
  -- pour l'exécution, pas une autorisation à diverger. On refuse de semer.
  if exists (
    select 1
    from trame s
    left join public.budget_categories racine
      on racine.budget_id = v_budget and racine.parent_id is null
     and lower(racine.name) = lower(s.category)
    left join public.budget_categories sous
      on sous.parent_id = racine.id and lower(sous.name) = lower(s.sub)
    where racine.id is null or (s.sub is not null and sous.id is null)
  ) then
    raise exception 'seed : une catégorie nommée par la trame n''existe pas — la trame et le jeu par défaut ont divergé.';
  end if;

  insert into public.transactions (
    budget_id, name, kind, amount, category_id, frequency, member_id, account, position
  )
  select
    v_budget, s.name, s.kind, s.amount, coalesce(sous.id, racine.id), s.frequency,
    case s.owner when 'a' then v_me when 'b' then v_partner end,
    nullif(s.account, ''),
    s.position
  from trame s
  left join public.budget_categories racine
    on racine.budget_id = v_budget and racine.parent_id is null
   and lower(racine.name) = lower(s.category)
  left join public.budget_categories sous
    on sous.parent_id = racine.id and lower(sous.name) = lower(s.sub);

  raise notice 'seed : compte % + budget « Notre budget » (mot de passe : %)', dev_email, dev_password;
end;
$$;
