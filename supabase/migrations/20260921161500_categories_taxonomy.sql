-- säckli — refonte du jeu de catégories par défaut, sur deux niveaux
--
-- Le jeu d'origine était plat et bâti autour d'un fourre-tout, « Charge », qui
-- ramassait les impôts, l'assurance maladie, la redevance et le vétérinaire. Il
-- masquait le deuxième poste du ménage : la santé, éclatée entre « Charge »
-- (assurance) et « Economie » (réserve pour la franchise).
--
-- Les racines existantes sont **renommées**, pas recréées : leurs identifiants,
-- leurs couleurs et le rattachement des lignes survivent tels quels. Seule
-- « Impôts & taxes » est nouvelle. Un budget dont l'utilisateur aurait déjà
-- renommé ses catégories n'est pas touché — le renommage ne s'applique qu'aux
-- noms du jeu d'origine, et jamais si le nom d'arrivée existe déjà.

-- --------------------------------------------------------- jeu par défaut

create or replace function public.seed_default_categories(b uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.budget_categories (budget_id, name, color, position)
  select b, t.name, t.color, t.position
  from (values
    ('Revenu',             '#2f9e6b', 0),
    ('Logement',           '#b8763a', 1),
    ('Santé',              '#a1453f', 2),
    ('Transport',          '#2f8fa1', 3),
    ('Alimentation',       '#6f9e2f', 4),
    ('Abonnements',        '#c2557f', 5),
    ('Loisirs',            '#8a5fa8', 6),
    ('Impôts & taxes',     '#1c1f1d', 7),
    ('Épargne & réserves', '#3f7fa1', 8),
    ('Divers',             '#6b716e', 9)
  ) as t(name, color, position)
  on conflict do nothing;

  -- Les sous-catégories se raccrochent par le nom de leur racine : la fonction
  -- reste rejouable, et sème ce qui manque sans toucher à ce qui existe.
  insert into public.budget_categories (budget_id, parent_id, name, position)
  select b, root.id, t.name, t.position
  from (values
    ('Revenu',             'Salaire',                       0),
    ('Revenu',             'Revenus variables',             1),
    ('Logement',           'Loyer',                         0),
    ('Logement',           'Énergie',                       1),
    ('Logement',           'Assurances logement',           2),
    ('Logement',           'Entretien',                     3),
    ('Santé',              'Assurance maladie',             0),
    ('Santé',              'Franchise & réserves',          1),
    ('Santé',              'Soins',                         2),
    ('Transport',          'Assurances & plaques',          0),
    ('Transport',          'Carburant',                     1),
    ('Transport',          'Entretien & réparations',       2),
    ('Transport',          'Transports publics & parking',  3),
    ('Alimentation',       'Courses',                       0),
    ('Alimentation',       'Restaurants & take-away',       1),
    ('Abonnements',        'Télécom',                       0),
    ('Abonnements',        'Streaming & médias',            1),
    ('Loisirs',            'Sport',                         0),
    ('Loisirs',            'Sorties & culture',             1),
    ('Loisirs',            'Vacances',                      2),
    ('Impôts & taxes',     'Impôts',                        0),
    ('Impôts & taxes',     'Taxes',                         1),
    ('Épargne & réserves', 'Épargne & placements',          0),
    ('Épargne & réserves', 'Réserves',                      1),
    ('Divers',             'Animaux',                       0),
    ('Divers',             'Cadeaux',                       1),
    ('Divers',             'Imprévus',                      2)
  ) as t(root, name, position)
  join public.budget_categories root
    on root.budget_id = b and root.parent_id is null and lower(root.name) = lower(t.root)
  on conflict do nothing;
end;
$fn$;

-- ------------------------------------------------------------- reprise

-- 1. renommage des racines d'origine, identifiants et couleurs conservés
update public.budget_categories c
set name = r.new_name
from (values
  ('Maison',     'Logement'),
  ('Charge',     'Santé'),
  ('Nourriture', 'Alimentation'),
  ('Media',      'Abonnements'),
  ('Loisir',     'Loisirs'),
  ('Economie',   'Épargne & réserves'),
  ('Autre',      'Divers')
) as r(old_name, new_name)
where c.parent_id is null
  and lower(c.name) = lower(r.old_name)
  -- Jamais de collision avec une racine que l'utilisateur aurait déjà créée.
  and not exists (
    select 1 from public.budget_categories x
    where x.budget_id = c.budget_id
      and x.parent_id is null
      and lower(x.name) = lower(r.new_name)
  );

-- 2. l'ordre d'affichage suit la nouvelle logique de lecture
update public.budget_categories c
set position = p.position
from (values
  ('Revenu', 0), ('Logement', 1), ('Santé', 2), ('Transport', 3), ('Alimentation', 4),
  ('Abonnements', 5), ('Loisirs', 6), ('Impôts & taxes', 7), ('Épargne & réserves', 8),
  ('Divers', 9)
) as p(name, position)
where c.parent_id is null and lower(c.name) = lower(p.name);

-- 3. « Impôts & taxes » et toutes les sous-catégories, pour chaque budget
do $$
declare
  b uuid;
begin
  for b in select id from public.budgets loop
    perform public.seed_default_categories(b);
  end loop;
end;
$$;

-- 4. descente des lignes dans les sous-catégories
--
-- Le rattachement se fait sur le nom de la ligne, à l'intérieur de sa racine
-- actuelle : les motifs sont donc exclusifs deux à deux au sein d'une racine.
-- Les `_` remplacent les lettres accentuées, pour attraper « Electricité »
-- comme « Électricité » sans dépendre de l'extension unaccent.
--
-- Une ligne qui ne correspond à rien **reste où elle est**, sur sa racine :
-- aucune reprise ne peut déclasser une ligne qu'elle n'a pas comprise.
with mapping(root, pattern, target_root, target_sub) as (values
  ('Revenu',             'salaire%',           'Revenu',             'Salaire'),

  ('Santé',              'imp_ts%',            'Impôts & taxes',     'Impôts'),
  ('Santé',              'taxe%',              'Impôts & taxes',     'Taxes'),
  ('Santé',              'assurance maladie%', 'Santé',              'Assurance maladie'),
  ('Santé',              'r_serve charges%',   'Épargne & réserves', 'Réserves'),
  ('Santé',              'billag%',            'Abonnements',        'Streaming & médias'),
  ('Santé',              'serafe%',            'Abonnements',        'Streaming & médias'),
  ('Santé',              'v_to%',              'Divers',             'Animaux'),
  ('Santé',              'dentiste%',          'Santé',              'Soins'),
  ('Santé',              'pharmacie%',         'Santé',              'Soins'),
  ('Santé',              'm_decin%',           'Santé',              'Soins'),

  ('Épargne & réserves', 'r_serve maladie%',   'Santé',              'Franchise & réserves'),
  ('Épargne & réserves', 'r_serve charges%',   'Épargne & réserves', 'Réserves'),
  ('Épargne & réserves', 'investissement%',    'Épargne & réserves', 'Épargne & placements'),
  ('Épargne & réserves', '_pargne%',           'Épargne & réserves', 'Épargne & placements'),
  ('Épargne & réserves', 'vacances%',          'Loisirs',            'Vacances'),

  ('Loisirs',            'fitness%',           'Loisirs',            'Sport'),
  ('Loisirs',            'loisirs%',           'Loisirs',            'Sorties & culture'),
  ('Loisirs',            'disney%',            'Abonnements',        'Streaming & médias'),
  ('Loisirs',            'iptv%',              'Abonnements',        'Streaming & médias'),
  ('Loisirs',            'crunchyroll%',       'Abonnements',        'Streaming & médias'),
  ('Loisirs',            'netflix%',           'Abonnements',        'Streaming & médias'),
  ('Loisirs',            'spotify%',           'Abonnements',        'Streaming & médias'),

  ('Logement',           'loyer%',             'Logement',           'Loyer'),
  ('Logement',           '%lectricit%',        'Logement',           'Énergie'),
  ('Logement',           'chauffage%',         'Logement',           'Énergie'),
  ('Logement',           'lessive%',           'Logement',           'Entretien'),
  ('Logement',           'assurance m_nage%',  'Logement',           'Assurances logement'),
  ('Logement',           'caution%',           'Logement',           'Assurances logement'),
  ('Logement',           'eca',                'Logement',           'Assurances logement'),

  ('Abonnements',        'internet%',          'Abonnements',        'Télécom'),
  ('Abonnements',        '%t_l_phone%',        'Abonnements',        'Télécom'),
  ('Abonnements',        'natel%',             'Abonnements',        'Télécom'),

  ('Alimentation',       'courses%',           'Alimentation',       'Courses'),
  ('Alimentation',       'restaurant%',        'Alimentation',       'Restaurants & take-away'),

  ('Transport',          'essence%',           'Transport',          'Carburant'),
  ('Transport',          'carburant%',         'Transport',          'Carburant'),
  ('Transport',          'panne%',             'Transport',          'Entretien & réparations'),
  ('Transport',          'assurance voiture%', 'Transport',          'Assurances & plaques'),
  ('Transport',          'plaque%',            'Transport',          'Assurances & plaques'),
  ('Transport',          'parking%',           'Transport',          'Transports publics & parking'),
  ('Transport',          'transports%',        'Transport',          'Transports publics & parking'),
  -- « Abonnement CFF », « Abonnement TL » : l'abonnement d'un transport public.
  ('Transport',          'abonnement%',        'Transport',          'Transports publics & parking')
),
resolved as (
  select t.id as transaction_id, child.id as category_id
  from public.transactions t
  join public.budget_categories current on current.id = t.category_id
  -- La racine de la ligne, qu'elle soit posée dessus ou sur une de ses filles.
  join public.budget_categories current_root
    on current_root.id = coalesce(current.parent_id, current.id)
  join mapping m
    on lower(current_root.name) = lower(m.root) and t.name ilike m.pattern
  join public.budget_categories target_root
    on target_root.budget_id = t.budget_id
   and target_root.parent_id is null
   and lower(target_root.name) = lower(m.target_root)
  join public.budget_categories child
    on child.parent_id = target_root.id and lower(child.name) = lower(m.target_sub)
)
update public.transactions t
set category_id = r.category_id
from resolved r
where r.transaction_id = t.id;
