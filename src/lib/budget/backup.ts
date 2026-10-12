import type { Budget, BudgetCategory, BudgetMember, Frequency, Transaction, TxKind } from '$lib/types';

/**
 * Sauvegarde d'un budget en JSON, pour le rapatrier ailleurs — typiquement du
 * dev vers la prod, où les comptes et donc les identifiants ne sont pas les mêmes.
 *
 * Aucun UUID ne sort : chaque objet reçoit une référence courte (`m1`, `c1`…)
 * qui ne vit que dans le fichier. L'import tire de nouveaux identifiants, le
 * fichier reste lisible et modifiable à la main.
 *
 * Aucun `user_id` non plus : un compte n'existe que dans sa base. Le membre qui
 * a exporté est marqué `me` et sera rattaché à qui importe ; les autres repartent
 * avec leur `invite_email`, que `claim_memberships()` reprendra à leur connexion.
 */
export const BACKUP_FORMAT = 'saeckli-budget';
export const BACKUP_VERSION = 1;

export interface BackupMember {
  ref: string;
  display_name: string;
  invite_email: string | null;
  position: number;
  /** Le membre de qui a exporté : il deviendra celui de qui importe. */
  me: boolean;
}

export interface BackupCategory {
  ref: string;
  /** Référence de la racine, ou null pour une racine. */
  parent: string | null;
  name: string;
  color: string | null;
  position: number;
}

export interface BackupSplit {
  member: string;
  weight: number;
}

export interface BackupTransaction {
  name: string;
  kind: TxKind;
  amount: number;
  category: string | null;
  frequency: Frequency;
  member: string | null;
  account: string | null;
  position: number;
  splits: BackupSplit[];
}

export interface BudgetBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  budget: { name: string };
  members: BackupMember[];
  categories: BackupCategory[];
  transactions: BackupTransaction[];
}

export interface BackupSource {
  budget: Budget;
  members: BudgetMember[];
  categories: BudgetCategory[];
  transactions: Transaction[];
}

export function toBackup(src: BackupSource, userId: string, now: Date): BudgetBackup {
  // Ordre total, pas celui de la base : à `position` égale, Postgres rend les
  // lignes dans un ordre quelconque, et les références `c12` changeraient de
  // catégorie d'un export à l'autre. Chaque racine est suivie de ses enfants.
  const byPosition = <T extends { position: number }>(name: (x: T) => string) =>
    (a: T, b: T) => a.position - b.position || name(a).localeCompare(name(b));
  const members = [...src.members].sort(byPosition((m) => m.display_name));
  const categories = src.categories
    .filter((c) => c.parent_id === null)
    .sort(byPosition((c) => c.name))
    .flatMap((root) => [
      root,
      ...src.categories.filter((c) => c.parent_id === root.id).sort(byPosition((c) => c.name))
    ]);
  const transactions = [...src.transactions].sort(byPosition((t) => t.name));

  const memberRef = new Map(members.map((m, i) => [m.id, `m${i + 1}`]));
  const categoryRef = new Map(categories.map((c, i) => [c.id, `c${i + 1}`]));
  // Une référence pendante (catégorie supprimée entre deux lectures) devient
  // null plutôt qu'un fichier que l'import refuserait.
  const ref = (map: Map<string, string>, id: string | null) => (id ? (map.get(id) ?? null) : null);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    budget: { name: src.budget.name },
    members: members.map((m) => ({
      ref: memberRef.get(m.id)!,
      display_name: m.display_name,
      invite_email: m.invite_email,
      position: m.position,
      me: m.user_id === userId
    })),
    categories: categories.map((c) => ({
      ref: categoryRef.get(c.id)!,
      parent: ref(categoryRef, c.parent_id),
      name: c.name,
      color: c.color,
      position: c.position
    })),
    transactions: transactions.map((t) => ({
      name: t.name,
      kind: t.kind,
      amount: t.amount,
      category: ref(categoryRef, t.category_id),
      frequency: t.frequency,
      member: ref(memberRef, t.member_id),
      account: t.account,
      position: t.position,
      splits: t.splits
        .filter((s) => memberRef.has(s.member_id))
        .map((s) => ({ member: memberRef.get(s.member_id)!, weight: s.weight }))
    }))
  };
}

/** `saeckli-budget-familial-2026-10-05.json` — sans accents ni espaces. */
export function backupFilename(name: string, now: Date): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `saeckli-${slug || 'budget'}-${now.toISOString().slice(0, 10)}.json`;
}

export type ParseResult = { ok: true; backup: BudgetBackup } | { ok: false; error: string };

class Invalid extends Error {}

const SMALLINT_MAX = 32767;
const AMOUNT_MAX = 1e10; // numeric(12, 2)

/**
 * Valide un fichier venu de l'extérieur et le réduit aux seuls champs connus.
 *
 * La base refuserait de toute façon un fichier incohérent, mais avec un message
 * de contrainte illisible (« violates check constraint … »). Ici, chaque refus
 * dit quelle ligne et pourquoi. Les règles sont celles du schéma : deux niveaux
 * de catégories, couleur sur la racine seule, noms uniques, poids en smallint.
 */
export function parseBackup(raw: unknown): ParseResult {
  try {
    return { ok: true, backup: readBackup(raw) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

function readBackup(raw: unknown): BudgetBackup {
  const root = obj(raw, 'Le fichier');
  if (root.format !== BACKUP_FORMAT) {
    throw new Invalid("Ce fichier n'est pas un export de budget säckli.");
  }
  if (typeof root.version === 'number' && root.version > BACKUP_VERSION) {
    throw new Invalid('Ce fichier vient d\'une version plus récente de säckli.');
  }
  if (root.version !== BACKUP_VERSION) throw new Invalid('Version du fichier inconnue.');

  const budget = obj(root.budget, 'Le budget');
  const name = text(budget.name, 'Le nom du budget');

  const members = list(root.members, 'La liste des membres').map((raw, i): BackupMember => {
    const at = `Membre ${i + 1}`;
    const m = obj(raw, at);
    return {
      ref: text(m.ref, `${at} : la référence`),
      display_name: text(m.display_name, `${at} : le nom`),
      invite_email: optionalText(m.invite_email, `${at} : l'email`),
      position: int(m.position, `${at} : la position`, 0, SMALLINT_MAX),
      me: m.me === true
    };
  });
  if (members.length === 0) throw new Invalid('Le budget doit compter au moins un membre.');
  unique(members.map((m) => m.ref), 'membre');
  if (members.filter((m) => m.me).length > 1) {
    throw new Invalid('Un seul membre peut être marqué comme vous.');
  }
  const memberRefs = new Set(members.map((m) => m.ref));

  const categories = list(root.categories, 'La liste des catégories').map((raw, i): BackupCategory => {
    const at = `Catégorie ${i + 1}`;
    const c = obj(raw, at);
    return {
      ref: text(c.ref, `${at} : la référence`),
      parent: optionalText(c.parent, `${at} : le parent`),
      name: text(c.name, `${at} : le nom`),
      color: optionalText(c.color, `${at} : la couleur`),
      position: int(c.position, `${at} : la position`, 0, SMALLINT_MAX)
    };
  });
  unique(categories.map((c) => c.ref), 'catégorie');
  const byRef = new Map(categories.map((c) => [c.ref, c]));
  for (const c of categories) {
    const at = `Catégorie « ${c.name} »`;
    if (c.parent !== null) {
      const parent = byRef.get(c.parent);
      if (!parent) throw new Invalid(`${at} : catégorie parente « ${c.parent} » introuvable.`);
      if (parent.parent !== null) {
        throw new Invalid(`${at} : une sous-catégorie ne peut pas en contenir une autre.`);
      }
      if (c.color !== null) throw new Invalid(`${at} : seule une catégorie racine porte une couleur.`);
    } else if (c.color === null || !/^#[0-9a-fA-F]{6}$/.test(c.color)) {
      throw new Invalid(`${at} : une catégorie racine demande une couleur au format #rrggbb.`);
    }
  }
  // Même portée que les deux index partiels : entre racines, puis entre sœurs.
  const siblings = new Set<string>();
  for (const c of categories) {
    const key = `${c.parent ?? ''}/${c.name.toLowerCase()}`;
    if (siblings.has(key)) throw new Invalid(`La catégorie « ${c.name} » apparaît deux fois au même niveau.`);
    siblings.add(key);
  }

  const transactions = list(root.transactions, 'La liste des lignes').map((raw, i): BackupTransaction => {
    const at = `Ligne ${i + 1}`;
    const t = obj(raw, at);
    const category = optionalText(t.category, `${at} : la catégorie`);
    if (category !== null && !byRef.has(category)) {
      throw new Invalid(`${at} : catégorie « ${category} » introuvable.`);
    }
    const member = optionalText(t.member, `${at} : le membre`);
    if (member !== null && !memberRefs.has(member)) {
      throw new Invalid(`${at} : membre « ${member} » introuvable.`);
    }
    const splits = list(t.splits ?? [], `${at} : la répartition`).map((raw, j): BackupSplit => {
      const s = obj(raw, `${at}, part ${j + 1}`);
      const ref = text(s.member, `${at}, part ${j + 1} : le membre`);
      if (!memberRefs.has(ref)) throw new Invalid(`${at} : membre « ${ref} » introuvable dans la répartition.`);
      return { member: ref, weight: int(s.weight, `${at}, part ${j + 1} : le poids`, 0, SMALLINT_MAX) };
    });
    if (new Set(splits.map((s) => s.member)).size !== splits.length) {
      throw new Invalid(`${at} : un membre apparaît deux fois dans la répartition.`);
    }
    return {
      name: typeof t.name === 'string' ? t.name : '',
      kind: oneOf(t.kind, ['income', 'expense'] as const, `${at} : le type`),
      amount: num(t.amount, `${at} : le montant`),
      category,
      frequency: oneOf(t.frequency, ['monthly', 'yearly'] as const, `${at} : la fréquence`),
      member,
      account: optionalText(t.account, `${at} : le compte`),
      position: int(t.position, `${at} : la position`, 0, 2 ** 31 - 1),
      splits
    };
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: typeof root.exported_at === 'string' ? root.exported_at : '',
    budget: { name },
    members,
    categories,
    transactions
  };
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Invalid(`${what} est mal formé.`);
  return v as Record<string, unknown>;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Invalid(`${what} est absente ou mal formée.`);
  return v;
}

function text(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Invalid(`${what} est manquant.`);
  return v.trim();
}

function optionalText(v: unknown, what: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') throw new Invalid(`${what} doit être un texte.`);
  return v.trim() || null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) >= AMOUNT_MAX) {
    throw new Invalid(`${what} n'est pas un nombre valide.`);
  }
  return Math.round(v * 100) / 100;
}

function int(v: unknown, what: string, min: number, max: number): number {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
    throw new Invalid(`${what} doit être un entier entre ${min} et ${max}.`);
  }
  return v as number;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], what: string): T {
  if (!values.includes(v as T)) throw new Invalid(`${what} doit valoir ${values.join(' ou ')}.`);
  return v as T;
}

function unique(refs: string[], what: string) {
  const seen = new Set<string>();
  for (const r of refs) {
    if (seen.has(r)) throw new Invalid(`La référence de ${what} « ${r} » apparaît deux fois.`);
    seen.add(r);
  }
}
