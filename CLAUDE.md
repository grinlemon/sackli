# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # serveur de dev
npm run build    # build de production (adapter-vercel)
npm run check    # svelte-check — doit rester à 0 erreur / 0 warning
npm run test     # vitest (calculs métier)
npx vitest run src/lib/budget/calc.test.ts -t "annuel"   # un seul test

npm run db:start   # stack Supabase local (Docker) — l'environnement de dev
npm run db:reset   # rejoue les migrations depuis zéro en local
npm run db:new <nom>   # nouvelle migration
npm run db:push    # applique au projet LIÉ, qui est celui de prod
```

`.env` est requis au runtime (voir `.env.example`) : `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`. L'env est lu via `$env/dynamic/public` dans [src/lib/supabase/env.ts](src/lib/supabase/env.ts) — délibérément dynamique, pour que le build passe sans credentials et échoue avec un message clair au runtime.

**Deux environnements** : dev = stack Supabase local (Docker), prod = projet cloud. Le code ne distingue pas les deux — seules les variables d'environnement changent (`.env` en local, dashboard Vercel en prod).

Le projet lié par `supabase link` est **celui de prod, et lui seul**, pour que `db:push` ne puisse pas viser le mauvais environnement. Le dev ne passe jamais par `db:push` mais par `db:reset`.

Toute évolution du schéma s'ajoute en nouvelle migration dans [supabase/migrations/](supabase/migrations/) — jamais de modification à la main dans Studio, sinon dev et prod divergent en silence. La confirmation d'email est activée en local (`supabase/config.toml`) comme en prod, parce que `claim_memberships()` en dépend ; les emails locaux arrivent dans Mailpit sur http://127.0.0.1:54324.

## Seed

Deux jeux de données à ne pas confondre :

- `supabase/seed.sql` — **dev uniquement, et hors de git** : il porte un vrai budget et ne vit qu'en local (`.gitignore`). Le dépôt n'en contient que le modèle, [supabase/seed.example.sql](supabase/seed.example.sql), au budget fictif, qu'on copie en `seed.sql` pour démarrer — les deux doivent suivre le jeu de catégories par défaut. Rejoué par `db:reset`, il crée le compte de dev (identifiants en tête du fichier, email déjà confirmé) et son budget, pour avoir un écran plein sans ressaisie. Il part du jeu de catégories semé par le trigger et n’exprime que son écart avec ce budget, puis nomme la catégorie de chaque ligne. Une trame qui nommerait une catégorie disparue **fait échouer le seed** : sans cette garde, la ligne retomberait sur sa racine en silence et le budget de dev dériverait sans que personne le voie. `db:push` n'applique que les migrations : ce fichier ne part jamais en prod. Il s'arrête de lui-même si la base contient déjà un autre compte, au cas où un `db reset` viserait le projet lié.
- `STARTER_ROWS` dans [src/lib/budget/seed.ts](src/lib/budget/seed.ts) — ce que reçoit **un nouveau compte** qui coche la case à la création d'un budget : les lignes courantes d'un ménage, montants à zéro. Chaque ligne vise un couple (racine, sous-catégorie) que `seedCategoryId()` traduit en identifiant, en retombant sur la racine puis sur `null` : une trame qui ne reconnaît plus une catégorie produit des lignes non classées, jamais mal classées. Aucun montant inventé, aucune donnée personnelle : c'est une trame à remplir, pas un exemple à croire.

## Règle métier centrale

La mensualisation précède **toujours** la répartition : `montant / 12` si annuel, *puis* application des parts. Répartir un montant annuel brut est le bug que ce projet doit éviter, et [src/lib/budget/calc.test.ts](src/lib/budget/calc.test.ts) le verrouille explicitement.

Tout le calcul est dans [src/lib/budget/calc.ts](src/lib/budget/calc.ts), en fonctions pures. Les composants affichent, ils ne dérivent rien — si un chiffre doit être calculé, il vient de ce module.

## Modèle de données

Deux notions distinctes qu'il ne faut pas confondre :

- **`transactions.member_id`** — à qui la ligne est *rattachée*. `NULL` = dépense commune. C'est ce qui sépare « participation aux dépenses communes » de « dépenses personnelles » dans la cascade.
- **`transaction_splits`** — qui *paie*, et dans quelle proportion.

`transaction_splits.weight` est un **poids, pas un pourcentage** : la part vaut `weight / SUM(weight)` sur la transaction. Il n'existe donc aucune contrainte « somme = 100 » à maintenir, et aucune écriture partielle ne peut produire un total faux. Poids tous nuls → répartition égale (fallback dans `shareOf`).

Les splits sont **optionnels** : leur absence signifie le défaut implicite (100 % pour `member_id`, parts égales si commun). On ne matérialise des lignes que quand l'utilisateur bouge le curseur. Changer le membre rattaché *supprime* les splits explicites plutôt que d'écrire des poids non choisis.

L'éditeur ([SplitEditor](src/lib/components/SplitEditor.svelte)) a un curseur par membre, quel que soit leur nombre : en bouger un **rééquilibre les autres** en proportion (`rebalance` dans `calc.ts`), pour que le total affiché reste 100 % et que la valeur lue soit celle qu'on vient de choisir. Il écrit en pourcentages entiers (plus fort reste, `wholePercents`), sauf le raccourci « Selon les revenus », sur base 10 000 comme l'équilibrage. Une répartition égale au défaut implicite supprime les splits au lieu de les écrire (`isDefaultSplit`). Dans la grille, la cellule n'en montre qu'un résumé qui ouvre l'éditeur en popover, hors du conteneur qui défile.

Un membre (`budget_members`) peut exister sans compte : `user_id` nullable, `invite_email` optionnel. Trois états, rendus dans les paramètres : rattaché / invité / hors compte.

## Catégories

Deux niveaux, pas un arbre : une catégorie racine (`parent_id is null`) et ses sous-catégories. Le trigger `budget_categories_validate_parent` refuse un troisième niveau et un parent venu d'un autre budget.

La **couleur vit sur la racine seule** — `budget_categories_color_on_root_only` impose `(parent_id is null) = (color is not null)`, pour qu'une sous-catégorie ne porte jamais une couleur que personne ne lit. Les sous-catégories héritent de la teinte du parent et s'en distinguent par l'opacité du fond ([src/lib/budget/colors.ts](src/lib/budget/colors.ts)).

L'unicité des noms passe par **deux index partiels** et non une contrainte unique sur `(budget_id, parent_id, lower(name))` : `null` n'étant jamais égal à `null` en SQL, cette dernière laisserait passer deux racines homonymes.

Un trigger `budgets_add_categories` sème le jeu par défaut à la création d'un budget, comme `budgets_add_owner` pour le membre #1. `seed_default_categories()` est **rejouable** : elle sème ce qui manque sans toucher à ce qui existe (`on conflict do nothing`), ce qui permet à une migration d'ajouter une catégorie au jeu et de la propager aux budgets existants en la rappelant simplement.

Le jeu par défaut — dix racines et leurs sous-catégories, de `Revenu` à `Divers` ([20260921161500_categories_taxonomy.sql](supabase/migrations/20260921161500_categories_taxonomy.sql)) — est écrit **deux fois** : dans la migration (pour que la base se suffise à elle-même) et dans `COLOR_PRESETS` (pour le sélecteur des paramètres), dont l'ordre suit celui des racines.

Il a remplacé un jeu plat bâti autour d'un fourre-tout, `Charge`, qui ramassait impôts, assurance maladie, redevance et vétérinaire, et masquait le deuxième poste d'un ménage : la santé, éclatée entre `Charge` et `Economie`. La reprise **renomme** les racines d'origine au lieu de les recréer — identifiants, couleurs et rattachement des lignes survivent — puis descend les lignes dans les sous-catégories par motif sur leur nom, à l'intérieur de leur racine. Une ligne qu'aucun motif ne reconnaît **reste sur sa racine** : une reprise ne déclasse jamais ce qu'elle n'a pas compris.

Supprimer une catégorie cascade sur ses sous-catégories et repasse les lignes concernées à `category_id = null` : aucune transaction n'est jamais perdue avec sa catégorie.

## Duplication d'un budget

`duplicate_budget(source_id, new_name)` ([migration](supabase/migrations/20260921183000_duplicate_budget.sql)) copie budget, membres, catégories, lignes et répartitions. Le faire depuis l'applicatif demanderait une dizaine d'allers-retours sans transaction : un échec à mi-parcours laisserait un budget à moitié peuplé. D'où une fonction SQL, atomique par construction.

Les nouveaux identifiants sont **tirés d'avance** dans des tables de correspondance temporaires : le remappage devient une jointure plutôt qu'une boucle, et les sous-catégories comme les répartitions retrouvent leur parent sans ordre d'insertion subtil. Les racines s'insèrent avant les enfants, `budget_categories_validate_parent` exigeant que le parent existe déjà.

Les triggers sèment un membre #1 et le jeu de catégories par défaut à l'insertion du budget : la fonction les **supprime** d'abord, puisqu'elle repart de la source et non du défaut.

`security definer`, donc la vérification d'accès ne se fait plus toute seule : la fonction appelle `is_budget_member(source_id)` explicitement. Membre et non propriétaire — on peut partir d'un budget qu'on partage. `user_id` est recopié : la copie est le même foyer, et sans lui les membres déjà rattachés perdraient l'accès.

## Démo sans compte

[/demo](src/routes/demo/+layout.svelte) ouvre un vrai budget de couple ([src/lib/demo/budget.ts](src/lib/demo/budget.ts)) que n'importe qui peut modifier sans s'inscrire. **Rien n'est enregistré, nulle part** : ni en base ni dans le navigateur. `BudgetState` construit avec `supabase = null` fait sa mise à jour locale et ne programme aucune écriture ; `add()` tire un identifiant local. Le budget vit le temps de l'onglet.

La démo réutilise les écrans de l'app tels quels : [BudgetView](src/lib/views/BudgetView.svelte), [AnalyseView](src/lib/views/AnalyseView.svelte) et [ExportView](src/lib/views/ExportView.svelte) ont été sortis de leurs routes, qui ne font plus que les rendre, et la coquille ([AppShell](src/lib/components/AppShell.svelte)) comme l'en-tête ([BudgetHeader](src/lib/components/BudgetHeader.svelte)) sont partagés. Une évolution de ces écrans arrive donc dans la démo sans rien y toucher. `BudgetView` accepte un `sheet` fourni : c'est ce qui fait voir aux vues Analyse et Export les modifications faites dans la grille.

La session ([session.svelte.ts](src/lib/demo/session.svelte.ts)) est instanciée par le layout, **jamais au niveau du module** : côté serveur, un état de module serait partagé entre tous les visiteurs. Pas de Paramètres dans la démo : membres, catégories et invitations passent par des actions serveur qui écrivent en base.

Le jeu de catégories y est écrit une **troisième** fois (`DEFAULT_TAXONOMY`), faute de base où le lire ; [budget.test.ts](src/lib/demo/budget.test.ts) le compare à la migration pour qu'il ne dérive pas.

## Export / import JSON

Pour rapatrier un budget d'une base à l'autre — typiquement du dev vers la prod, où rien ne correspond : ni les comptes, ni les identifiants. [/budgets/[id]/export.json](src/routes/(app)/budgets/[id]/export.json/+server.ts) télécharge le fichier, l'action `import` de « Mes budgets » le relit. Format et validation sont dans [backup.ts](src/lib/budget/backup.ts), en fonctions pures.

**Aucun UUID ne sort** : chaque membre et catégorie reçoit une référence courte (`m1`, `c1`…) qui ne vit que dans le fichier. L'export suit un **ordre total** (racine puis ses enfants, à position égale par nom) : à `position` égale, Postgres rend les lignes dans un ordre quelconque, et `c12` changerait de catégorie d'un export à l'autre.

**Aucun `user_id` non plus** : un compte n'existe que dans sa base. Le membre de qui a exporté est marqué `me` et devient celui de qui importe (à défaut, le premier membre — sinon l'importateur créerait un budget dont il ne serait pas membre). Les autres repartent avec leur `invite_email`, que `claim_memberships()` reprend à leur connexion ; un membre rattaché sans email d'invitation revient donc « hors compte ».

`parseBackup()` valide d'abord, avec les règles du schéma (deux niveaux, couleur sur la racine seule, noms uniques par niveau, poids en `smallint`), pour nommer la ligne fautive plutôt que de renvoyer un message de contrainte. Puis `import_budget(payload, new_name)` ([migration](supabase/migrations/20261005194917_import_budget.sql)) écrit tout d'un bloc, sur le modèle de `duplicate_budget()`, et refuse lui-même une référence pendante — une jointure la perdrait en silence.

Elle est `security invoker`, contrairement à `duplicate_budget()` : rien n'est lu dans un autre budget, les policies suffisent au contrôle d'accès. D'où l'ordre des suppressions après l'insertion du budget : catégories semées *avant* membres semés, la policy des catégories exigeant d'être membre.

L'import crée toujours un **nouveau** budget, il ne fusionne ni ne remplace rien.

## RLS

Les policies passent par des fonctions `security definer` (`is_budget_member`, `is_budget_owner`, `can_access_transaction`). Ce n'est pas cosmétique : une policy sur `budgets` qui interrogerait directement `budget_members`, et l'inverse, provoque une récursion infinie. Toute nouvelle table liée à un budget doit réutiliser ces helpers.

`claim_memberships()` rattache un membre en attente à son compte, **uniquement si `email_confirmed_at` est non nul** — sans cette garde, s'inscrire avec l'email de quelqu'un d'autre suffirait à entrer dans son budget. Elle est appelée depuis [src/routes/(app)/+layout.server.ts](src/routes/(app)/+layout.server.ts).

Un trigger `budgets_add_owner` crée le membre #1 à la création d'un budget : personne ne peut se retrouver enfermé dehors du sien.

## Suppression de compte

[/account](src/routes/(app)/account/+page.server.ts) appelle `delete_account()` ([migration](supabase/migrations/20261009120000_delete_account.sql)) : l'app n'a que la clé anon et ne peut pas supprimer un utilisateur d'Auth elle-même, d'où une fonction `security definer` qui ne vise que `auth.uid()`.

Les clés étrangères font le reste en supprimant `auth.users` — profil effacé, place gardée « hors compte » dans les budgets des autres (`set null`). Sauf un point : `budgets.owner_id` cascade, et un budget partagé disparaîtrait pour tous. La fonction le **transmet** donc d'abord au membre rattaché suivant (par `position`) ; seuls les budgets que personne d'autre n'utilise partent avec le compte. La page calcule la même chose pour l'annoncer avant la confirmation, qui exige de retaper son email.

## Emails d'authentification

Supabase envoie lui-même les emails : inscription, renvoi du lien, mot de passe oublié, alerte de changement de mot de passe. L'app n'a aucun serveur de mail, seulement des templates.

Tous les liens reviennent sur [/auth/confirm](src/routes/auth/confirm/+server.ts), qui échange ce qu'ils transportent contre une session :

- **`token_hash`** via `verifyOtp` — le flux des templates de [supabase/templates/](supabase/templates/), indépendant de l'appareil : ouvrir l'email sur son téléphone fonctionne.
- **`code`** (PKCE) — celui des templates par défaut de Supabase, qui exige le navigateur de la demande. Accepté quand même, pour qu'un projet aux templates oubliés envoie des liens qui marchent au moins là.

Le `redirectTo` vient d'`emailRedirect()` ([src/lib/auth.ts](src/lib/auth.ts)), construit sur `url.origin` : c'est le déploiement réel qui décide du retour, pas la Site URL. Il **porte toujours `?next=`**, et les templates comptent dessus en ajoutant `&token_hash=…`. Une URL absente des *Redirect URLs* du projet est remplacée en silence par la Site URL, ce qui casse le lien : d'où `/**` dans la liste, en local (`config.toml`) comme en prod.

L'email de confirmation porte un lien **et** un code (`{{ .Token }}`), saisi sur [/verify](src/routes/verify/+page.server.ts) via `verifyOtp({ email, token, type: 'email' })`. Le code marche d'un appareil à l'autre et survit aux antivirus de messagerie qui « cliquent » les liens et consomment ainsi un jeton à usage unique. L'inscription comme une connexion refusée faute de confirmation mènent à cette étape, qui ouvre la session directement : pas de détour par la connexion. Une inscription sur une adresse déjà confirmée renvoie un utilisateur sans `identities` et **n'envoie rien** : l'action le détecte au lieu d'annoncer un email qui n'arrivera jamais.

Sans budget, « Mes budgets » montre directement le formulaire de création, pré-rempli : pas de page vide à interpréter.

Un lien de récupération mène toujours à [/reset-password](src/routes/reset-password/+page.server.ts), qui exige la session que le lien vient d'ouvrir. Tout `?next=` passe par `safeNext()` : `//ailleurs.com` est une autre origine pour le navigateur, et un lien de connexion ne doit pas servir de tremplin.

Les templates de `supabase/templates/` ne valent **que pour le local** (`config.toml`). En prod, ils se collent à la main dans le dashboard (*Authentication → Emails*), sujets compris : les modifier ici sans les recoller laisse la prod sur l'ancienne version.

Le SMTP intégré de Supabase n'envoie qu'aux adresses des membres de l'organisation Supabase, et quelques emails par heure : en prod, il faut un SMTP externe (*Authentication → SMTP Settings*) pour que quiconque d'autre puisse s'inscrire.

## Filtres et tri

Tout est dans [src/lib/budget/filters.ts](src/lib/budget/filters.ts), en fonctions pures comme `calc.ts` : la page appelle `viewTransactions()` et affiche ce qu'elle reçoit.

Le tri ne touche **jamais** `position` : l'ordre de saisie reste la donnée, le tri n'est qu'une vue. La vue par défaut (`DEFAULT_SORT`, clé `default`) classe par catégorie dans l'ordre d'affichage, puis par montant mensuel croissant : une ligne ajoutée rejoint sa famille et son rang au lieu de s'empiler en bas. Un en-tête se clique croissant → décroissant → retour à ce tri par défaut, et les valeurs vides restent en bas dans les deux sens. L'ordre de saisie reste disponible dans le menu de tri mobile.

Deux choix qui découlent de la règle métier : les bornes de montant et le tri « par mois » portent sur le montant **mensualisé** (sans quoi un annuel et un mensuel ne seraient pas comparables), et trier par catégorie suit l'ordre d'affichage racine → enfant plutôt que l'alphabet, pour ne pas casser les familles.

Filtrer une racine embarque ses sous-catégories ; filtrer une sous-catégorie ne remonte pas. Les compteurs d'onglets s'évaluent après les autres filtres, et les totaux du pied de grille portent sur la vue affichée — ce qui est montré est ce qui est additionné.

L'état des filtres vit dans le composant, pas dans l'URL : une query string relancerait le `load`, donc reconstruirait `BudgetState` à chaque frappe.

Le groupement (`groupByCategory`) se pose **au-dessus** du tri : il reçoit des lignes déjà triées et ne fait que les répartir. C'est la racine qui groupe, jamais la sous-catégorie — sinon une famille se retrouverait éclatée en autant de blocs qu'elle a d'enfants. Groupée, la colonne Catégorie d'une ligne ne montre plus que la sous-catégorie (`—` = rattachée à la racine seule), la racine étant déjà lisible dans l'en-tête du groupe ; le reste de l'arbre reste dans le `select`, sous « Déplacer vers », pour ne pas perdre la réaffectation.

## Répartition du revenu

Le panneau de la vue Analyse répond à « où va le revenu du ménage », là où le diagramme de flux répond à « dans quelles catégories ». `incomeFlow()` et `memberFlow()` sont dans [calc.ts](src/lib/budget/calc.ts), comme tout le reste du calcul.

Il a remplacé une barre héritée du prototype qui redoublait le panneau « Répartition prévue » posé à côté — les mêmes quatre chiffres, affichés trois fois avec la légende. Les étiquettes vivent maintenant **dans** les segments : une barre qui oblige à descendre lire une légende ne sert à rien.

Les barres par membre sont à l'échelle du revenu **de ce membre**, pas du ménage. C'est ce qui rend deux personnes comparables quand leurs revenus diffèrent : elles supportent le même montant commun sans fournir le même effort, et c'est précisément ce que la barre du ménage ne peut pas montrer.

En déficit, l'échelle devient celle des dépenses et `overrun` annonce le dépassement — l'ancienne barre laissait les segments sortir du cadre en silence.

Le seuil d'affichage d'une étiquette est une **requête de conteneur**, pas un pourcentage : 16 % valent 190px sur un panneau large et 30px sur un étroit, et au pourcentage la barre affichait « Perso… CH… » dès que la fenêtre se resserrait. En CSS plutôt qu'en mesure JS, c'est juste dès le rendu serveur et ça suit le redimensionnement tout seul.

## Équilibrage du commun

Un panneau des paramètres projette, en direct, le reste de chacun si **toutes** les lignes communes suivaient la même répartition. `simulateCommonSplit()`, `balancedCommonWeights()` et `balanceSpread()` sont dans [calc.ts](src/lib/budget/calc.ts), en fonctions pures qui ne lisent que des montants : **la simulation n'écrit rien**, et seul le bouton « Appliquer » déclenche l'action `balanceCommon`.

Trois règles au choix (`BalanceMode`) : **même reste après le commun** (`common` — le personnel vient ensuite, chacun le sien), **même reste à la fin** (`total` — qui dépense plus pour lui porte moins de commun), **au prorata des revenus** (`income`, via `incomeWeights`). Un quatrième mode, **libre**, rend la main au curseur ; hors de lui, le curseur affiche ce que la règle calcule sans se laisser déplacer. Changer de mode recalcule tout de suite, mais rien ne s'écrit avant « Appliquer ».

La règle n'est **pas stockée** : elle ne sert qu'à calculer des parts, et seules les parts s'écrivent — pas de colonne, rien à porter dans l'export, l'import ou la duplication. L'écran la **retrouve** à l'ouverture (`detectBalanceChoice`) en recalculant chaque règle et en la comparant à la répartition en vigueur (`appliedCommonWeights`), au centième de pourcent près, la précision d'écriture. Si les montants ont bougé depuis, plus aucune règle ne tombe juste et l'écran s'ouvre en libre — ce qui est exact : la répartition appliquée ne suit plus la règle.

L'égalisation a une forme close, pas d'approche itérative : `reste_i = disponible_i − part_i`, où le disponible vaut le revenu (`common`) ou le revenu moins le perso (`total`), et les parts totalisent le commun ; les égaliser toutes à R donne `R = (Σ disponible_i − commun) / n` puis `part_i = disponible_i − R`. Un membre dont le disponible tombe sous R obtiendrait une part négative — il serait payé par les autres : on l'écarte à zéro et on recommence sans lui, quitte à ne plus égaliser parfaitement.

Les parts partent sur une **base de 10 000, pas 100** : `transaction_splits.weight` est un `smallint`, et au centième de pourcent l'égalisation tombe juste au centime près au lieu de laisser quelques francs d'écart. Rien d'autre dans l'app ne s'en aperçoit, `shareOf` normalisant les poids ligne par ligne.

L'action fait table rase des splits des lignes communes avant d'écrire : une ligne réglée à la main doit suivre, sinon « toutes les lignes communes » serait faux. Et des parts **égales** ne sont pas matérialisées — c'est le défaut implicite du modèle, on supprime les lignes plutôt que d'écrire ce qui va de soi.

## Diagramme de flux

[src/lib/budget/sankey.ts](src/lib/budget/sankey.ts) construit le graphe (`buildSankey`) et le met en page (`layoutSankey`) en fonctions pures ; [Sankey.svelte](src/lib/components/Sankey.svelte) ne fait que tracer. Revenus → catégorie → sous-catégorie → ligne, tout mensualisé avant d'entrer dans le graphe.

Trois points non négociables, chacun verrouillé par un test :

- **Une échelle unique pour tout le diagramme.** Deux rubans de même épaisseur valent le même montant, où qu'ils soient — sinon comparer deux branches ne veut plus rien dire. Plancher d'1 px pour qu'une ligne à 9.–/mois reste visible.
- **Un nœud se place au point d'attache de son ruban chez son parent**, pas au centre de sa colonne. Une colonne clairsemée centrée sur elle-même envoie ses rubans traverser tout le diagramme.
- **Toutes les lignes dans la dernière colonne**, y compris celles posées directement sur une racine : elles sautent la colonne des sous-catégories plutôt que de s'éparpiller. Une colonne vide est retirée (`columns` est compacté).

Les étiquettes s'écartent verticalement quand les nœuds sont trop fins pour les porter, avec un trait de rappel vers leur nœud : sans cela, sur un budget réel, on n'en lirait qu'une sur cinq dans la colonne des lignes.

Les montants s'affichent en francs ou en part du revenu. Le dénominateur est `graph.total` — le revenu, ou les dépenses à défaut : c'est la source du flux, donc le seul repère qui rende deux branches comparables. Un pourcentage du parent dirait « Loyer = 95 % de Logement » sans dire ce que pèse Logement. L'infobulle donne toujours les deux, une part seule ne disant pas de combien on parle.

## Export PDF

[/budgets/[id]/export](src/routes/(app)/budgets/[id]/export/+page.svelte) compose le rapport, et c'est **le navigateur qui fabrique le PDF** (`window.print()`). Pas de dépendance, pas de Chromium à embarquer sur Vercel, et le diagramme sort en vectoriel puisqu'il est déjà en SVG.

Le document est rendu **à la largeur utile d'une page** ([print.ts](src/lib/budget/print.ts) : A4 paysage moins ses marges, 1032×703px à 96dpi). L'aperçu à l'écran est donc le tirage : rien ne se recompose au moment d'imprimer. C'est ce qui permet au diagramme d'être dessiné à une largeur *imposée* plutôt que mesurée — une mesure du conteneur ne survivrait pas au passage à l'impression, où la fenêtre n'a plus rien à voir avec la feuille.

`PAGE_WIDTH` / `PAGE_HEIGHT`, la règle `@page` de [src/app.css](src/app.css) et le test de tenue en page lisent les mêmes constantes : les trois doivent bouger ensemble, sinon le contrôle ne contrôle plus rien.

Un diagramme plus haut que sa page serait tranché en plein milieu des rubans par le saut de page. `fitScale()` le réduit d'un bloc à la place — réduction uniforme, largeur comprise, pour que les étiquettes gardent leur taille relative au dessin.

Le shell de l'app (`h-screen` + `<main>` comme conteneur de scroll) ne survit pas à l'impression : sans les variantes `print:` posées sur [(app)/+layout.svelte](src/routes/(app)/+layout.svelte), seule la partie visible à l'écran sortirait.

## Écritures côté client

La grille n'utilise pas de form actions : [src/lib/budget/state.svelte.ts](src/lib/budget/state.svelte.ts) fait une mise à jour optimiste locale puis une écriture debouncée (400 ms). Les selects écrivent avec `delay = 0`, les champs libres sont debouncés.

`flush()` **exécute** les écritures en attente, il ne les annule pas — il est appelé sur `beforeNavigate` et `beforeunload`. Une modification de cette classe qui laisserait tomber des écritures en attente est une perte de données silencieuse.

`BudgetState` est instancié dans un `$derived` : il se reconstruit quand `data` change (navigation, invalidation), avec une copie défensive du tableau venu du `load`.

## Mobile

Deux seuils, pas un. **`sm` (640px) change la coquille** : sous lui, la barre latérale se réduit à un bandeau (marque, budget courant, déconnexion) et la navigation descend en onglets fixes en bas, sous le pouce. **`lg` (1024px) change la grille** : en dessous, ses 1060px de plancher défileraient de côté et l'on ne verrait jamais le montant mensuel. Elle laisse place à des cartes en lecture ([TransactionCard](src/lib/components/TransactionCard.svelte)) et à une fiche d'édition qui monte du bas ([TransactionSheet](src/lib/components/TransactionSheet.svelte)). Le seuil est `lg` et non `sm` parce qu'une tablette en portrait n'a pas plus la place de la grille qu'un téléphone.

La fiche écrit par les mêmes appels à `BudgetState` que la grille, et l'éditeur de répartition est un composant partagé ([SplitEditor](src/lib/components/SplitEditor.svelte)) : deux éditeurs des mêmes poids ne doivent pas pouvoir diverger. Fermer la fiche appelle `flush()`, rien n'est à « valider ». C'est un `<dialog>` modal, pour le focus piégé, Échap et l'inertie du fond sans rien réimplémenter.

La carte montre le montant **mensuel**, comme la colonne « par mois » ; l'annuel saisi suit en second rang. Les totaux passent en haut de page : c'est ce qu'on vient lire sur un téléphone.

Tout champ sous 16px fait zoomer Safari iOS au toucher, sans dézoomer ensuite : [app.css](src/app.css) remonte les champs à 16px sous `sm`. Les cibles tactiles visent 44px (`max-sm:min-h-[44px]`), et les barres fixes tiennent compte de `env(safe-area-inset-*)` (`viewport-fit=cover` dans `app.html`).

Le diagramme de flux part du niveau « Catégories » sous `sm` : deux colonnes tiennent à la largeur d'un écran, trois demandent 700px. L'aperçu d'export est réduit par `zoom` **à l'écran seulement** (`@media screen`) : le tirage reste à `PAGE_WIDTH`.

## Design

Les tokens sont dans `@theme` de [src/app.css](src/app.css) — Tailwind v4 n'utilise plus `tailwind.config.js`. Pas de valeur hexadécimale en dur dans un composant quand un token existe.

Polices : **Fraunces** pour les titres et les montants mis en avant (`font-serif`), **Inter** pour tout le reste (`font-sans`). Elles sont **hébergées avec le site** (`@fontsource-variable/*`, importées dans [src/routes/+layout.svelte](src/routes/+layout.svelte)) et non chargées depuis Google Fonts : aucune requête vers un tiers, donc aucune IP de visiteur transmise. L'image de partage `static/og.png` n'est pas dessinée à part : c'est une **photo du hero** de la landing ([scripts/og-image.mjs](scripts/og-image.mjs), `npm run og` avec le serveur de dev lancé). Toute évolution visible du hero — police, couleurs, textes — se répercute en la relançant, puis en montant `OG_VERSION` dans [src/lib/seo.ts](src/lib/seo.ts) : les réseaux gardent l'image en cache tant que son URL ne change pas.

`GRID_COLS` dans [src/lib/budget/ui.ts](src/lib/budget/ui.ts) est partagé par l'en-tête, les lignes et les en-têtes de groupe : tous doivent rester alignés, d'où la constante unique — et `GRID_MIN_W`, extraite pour que l'en-tête de groupe, qui n'est pas une grille, partage le même plancher.

Ce plancher (1060px) est **calculé, pas choisi** : c'est ce qu'il faut pour que la colonne Catégorie affiche en entier l'étiquette la plus longue du jeu par défaut, « Transports publics & parking ». Allonger un nom de sous-catégorie, c'est donc devoir refaire ce calcul — le commentaire du fichier donne le pire cas de chaque colonne.
