import type { BudgetCategory, Transaction } from '$lib/types';
import { monthlyAmount } from './calc';
import { tint } from './colors';
import { groupByCategory } from './filters';

/**
 * Le flux du budget, de gauche à droite : revenus → catégorie → sous-catégorie
 * → ligne. Construction et mise en page sont deux fonctions pures ; le composant
 * ne fait que tracer ce qu'elles renvoient.
 *
 * Tout est mensualisé (`monthlyAmount`) avant d'entrer dans le graphe : un
 * annuel et un mensuel doivent avoir la même épaisseur pour la même charge
 * réelle. La répartition entre membres, elle, ne joue pas ici — le diagramme
 * regarde le ménage, pas qui paie.
 */

export type SankeyKind = 'income' | 'root' | 'child' | 'leaf' | 'rest';

export interface SankeyNode {
  id: string;
  label: string;
  /** Montant mensuel, tel qu'on l'affiche — pas la hauteur dessinée. */
  value: number;
  depth: number;
  kind: SankeyKind;
  color: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color: string;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Nombre de colonnes réellement occupées. */
  columns: number;
  /**
   * Montant auquel les pourcentages se rapportent : le revenu, ou les dépenses
   * s'il n'y a pas de revenu. C'est la source du flux, donc le seul
   * dénominateur qui rende deux branches comparables — un pourcentage du parent
   * dirait « Loyer = 95 % de Logement » sans dire ce que pèse Logement.
   */
  total: number;
}

/** Jusqu'où le diagramme descend. */
export type SankeyDetail = 'roots' | 'children' | 'lines';

const INCOME = 'income';
const REST = 'rest';

// Les teintes fixes passent par les tokens : seules les couleurs de catégorie
// sont des données, et elles arrivent en hexadécimal depuis la base.
const INCOME_NODE = 'var(--color-deep)';
const INCOME_LINK = 'var(--color-seg-common)';
const REST_NODE = 'var(--color-seg-rest)';
const REST_LINK = 'var(--color-seg-a)';
const NEUTRAL = '#b9c6c0';

const LINK_ALPHA = 0.32;
const CHILD_ALPHA = 0.72;
const LEAF_ALPHA = 0.46;

export function buildSankey(
  transactions: Transaction[],
  categories: BudgetCategory[],
  detail: SankeyDetail = 'lines'
): SankeyGraph {
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  const income = transactions
    .filter((t) => t.kind === 'income')
    .reduce((a, t) => a + monthlyAmount(t), 0);

  // Une ligne à zéro n'a pas de ruban : elle encombrerait la colonne sans rien
  // y montrer.
  const expenses = transactions.filter((t) => t.kind === 'expense' && monthlyAmount(t) > 0);
  const spent = expenses.reduce((a, t) => a + monthlyAmount(t), 0);

  if (income <= 0 && spent <= 0) return { nodes: [], links: [], columns: 0, total: 0 };

  nodes.push({
    id: INCOME,
    label: 'Revenus',
    value: income,
    depth: 0,
    kind: 'income',
    color: INCOME_NODE
  });

  // Les nœuds sont empilés dans l'ordre où on les pousse, et on les pousse en
  // parcourant l'arbre : les colonnes se retrouvent alignées et les rubans ne
  // se croisent pas.
  for (const group of groupByCategory(expenses, categories)) {
    const root = group.root;
    const color = root?.color ?? NEUTRAL;
    const rootId = `root:${group.key}`;

    nodes.push({
      id: rootId,
      label: root?.name ?? 'Non classé',
      value: group.expense,
      depth: 1,
      kind: 'root',
      color
    });
    links.push({ source: INCOME, target: rootId, value: group.expense, color: tint(color, LINK_ALPHA) });

    if (detail === 'roots') continue;

    const leaf = (parent: string, tx: Transaction) => {
      const value = monthlyAmount(tx);
      const id = `tx:${tx.id}`;
      nodes.push({
        id,
        label: tx.name.trim() || 'Sans nom',
        value,
        depth: 3,
        kind: 'leaf',
        color: tint(color, LEAF_ALPHA)
      });
      links.push({ source: parent, target: id, value, color: tint(color, LINK_ALPHA) });
    };

    const children = root ? categories.filter((c) => c.parent_id === root.id) : [];
    for (const child of children) {
      const lines = group.transactions.filter((t) => t.category_id === child.id);
      if (lines.length === 0) continue;
      const total = lines.reduce((a, t) => a + monthlyAmount(t), 0);
      const childId = `cat:${child.id}`;

      nodes.push({
        id: childId,
        label: child.name,
        value: total,
        depth: 2,
        kind: 'child',
        color: tint(color, CHILD_ALPHA)
      });
      links.push({ source: rootId, target: childId, value: total, color: tint(color, LINK_ALPHA) });

      if (detail === 'lines') for (const tx of lines) leaf(childId, tx);
    }

    // Une ligne posée directement sur la racine saute la colonne des
    // sous-catégories : toutes les lignes restent dans la même colonne, celle
    // de droite, au lieu de s'éparpiller selon qu'elles sont classées finement.
    if (detail === 'lines') {
      const direct = group.transactions.filter((t) => t.category_id === (root?.id ?? null));
      for (const tx of direct) leaf(rootId, tx);
    }
  }

  const rest = income - spent;
  if (rest >= 0.5) {
    nodes.push({ id: REST, label: 'Reste', value: rest, depth: 1, kind: 'rest', color: REST_NODE });
    links.push({ source: INCOME, target: REST, value: rest, color: REST_LINK });
  }

  // Sans sous-catégorie nulle part, la colonne 2 n'existe pas : on la retire
  // plutôt que de laisser une colonne vide au milieu du diagramme.
  const used = [...new Set(nodes.map((n) => n.depth))].sort((a, b) => a - b);
  const rank = new Map(used.map((d, i) => [d, i]));
  for (const node of nodes) node.depth = rank.get(node.depth) ?? 0;

  return { nodes, links, columns: used.length, total: income > 0 ? income : spent };
}

export interface LaidNode extends SankeyNode {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Où poser l'étiquette, et la place dont elle dispose avant la colonne suivante. */
  labelX: number;
  labelRoom: number;
  /**
   * Hauteur de l'étiquette. Elle vise le milieu du nœud mais s'écarte de sa
   * voisine : dans la colonne des lignes, la plupart des nœuds sont trop fins
   * pour porter un texte, et sans cet écartement on n'en lirait qu'un sur cinq.
   */
  labelY: number;
  /** L'étiquette a dû s'écarter : un trait de rappel la relie à son nœud. */
  leader: boolean;
}

export interface LaidLink extends SankeyLink {
  path: string;
  width: number;
}

export interface SankeyLayout {
  nodes: LaidNode[];
  links: LaidLink[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  width: number;
  nodeWidth?: number;
  /** Écart vertical entre deux nœuds d'une même colonne. */
  gap?: number;
  /** Place réservée à droite pour les étiquettes de la dernière colonne. */
  labelReserve?: number;
  /** Hauteur souhaitée par nœud dans la colonne la plus peuplée. */
  rowHeight?: number;
  minHeight?: number;
  /** Écart vertical minimal entre deux étiquettes. */
  labelStep?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Un ruban : deux courbes miroir refermées, pour que l'épaisseur suive la valeur. */
function ribbon(x0: number, y0: number, x1: number, y1: number, w: number): string {
  const mx = round((x0 + x1) / 2);
  const [a, b, c, d] = [round(y0), round(y1), round(y1 + w), round(y0 + w)];
  return `M${round(x0)},${a}C${mx},${a} ${mx},${b} ${round(x1)},${b}L${round(x1)},${c}C${mx},${c} ${mx},${d} ${round(x0)},${d}Z`;
}

/**
 * Place les nœuds et trace les rubans. L'échelle est commune à tout le
 * diagramme : deux épaisseurs identiques valent le même montant, où qu'elles
 * soient — sans quoi comparer deux branches n'aurait plus de sens.
 */
export function layoutSankey(graph: SankeyGraph, options: LayoutOptions): SankeyLayout {
  const {
    width,
    nodeWidth = 12,
    gap = 7,
    labelReserve = 160,
    rowHeight = 19,
    minHeight = 260,
    labelStep = 13
  } = options;

  if (graph.nodes.length === 0 || graph.columns === 0) {
    return { nodes: [], links: [], width, height: 0 };
  }

  const columns: SankeyNode[][] = Array.from({ length: graph.columns }, () => []);
  for (const node of graph.nodes) columns[node.depth].push(node);

  // Un nœud ne peut pas être plus court que ce qui le traverse : si les sorties
  // dépassent les entrées (budget en déficit), c'est le flux qui décide.
  const flow = new Map<string, { in: number; out: number }>();
  const track = (id: string) => flow.get(id) ?? { in: 0, out: 0 };
  for (const link of graph.links) {
    const s = track(link.source);
    flow.set(link.source, { ...s, out: s.out + link.value });
    const t = track(link.target);
    flow.set(link.target, { ...t, in: t.in + link.value });
  }
  const weight = (node: SankeyNode) => {
    const f = track(node.id);
    return Math.max(node.value, f.in, f.out);
  };

  // La colonne la plus peuplée impose la hauteur, la plus chargée l'échelle.
  let height = Math.max(
    minHeight,
    ...columns.map((col) => col.length * rowHeight + (col.length - 1) * gap)
  );
  let scale = Infinity;
  for (const col of columns) {
    const total = col.reduce((a, n) => a + weight(n), 0);
    if (total <= 0) continue;
    scale = Math.min(scale, (height - (col.length - 1) * gap) / total);
  }
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;

  const heights = new Map<string, number>();
  for (const col of columns) {
    let stacked = (col.length - 1) * gap;
    for (const node of col) {
      const h = Math.max(weight(node) * scale, 2);
      heights.set(node.id, h);
      stacked += h;
    }
    // Les hauteurs planchers peuvent déborder : on allonge plutôt que de rogner.
    height = Math.max(height, stacked);
  }

  const usable = width - labelReserve;
  const step = graph.columns > 1 ? (usable - nodeWidth) / (graph.columns - 1) : 0;

  // Le graphe est un arbre : chaque nœud a un seul lien entrant.
  const incoming = new Map<string, number>();
  graph.links.forEach((link, i) => {
    if (!incoming.has(link.target)) incoming.set(link.target, i);
  });

  const laid = new Map<string, LaidNode>();
  const nodes: LaidNode[] = [];
  // Point d'attache du ruban chez son parent — il décide aussi de la hauteur
  // de l'enfant, ce qui rend les rubans horizontaux et supprime les croisements.
  const linkTop = new Array<number>(graph.links.length).fill(0);
  const outCursor = new Map<string, number>();

  for (const [depth, col] of columns.entries()) {
    const x0 = depth * step;
    const last = depth === graph.columns - 1;

    // La première colonne n'a pas de parent : elle se centre, tout le reste suit.
    let cursor = 0;
    if (depth === 0) {
      const stacked = col.reduce((a, n) => a + (heights.get(n.id) ?? 0), 0) + (col.length - 1) * gap;
      cursor = Math.max((height - stacked) / 2, 0);
    }

    for (const node of col) {
      const h = heights.get(node.id) ?? 0;
      const index = incoming.get(node.id);
      let wanted = cursor;

      if (index !== undefined) {
        const link = graph.links[index];
        const parent = laid.get(link.source);
        if (parent) {
          wanted = outCursor.get(link.source) ?? parent.y0;
          linkTop[index] = wanted;
          outCursor.set(link.source, wanted + Math.max(link.value * scale, 1));
        }
      }

      // Le nœud suit son parent, sauf si la place est déjà prise au-dessus :
      // le ruban devient alors oblique plutôt que de se superposer à un voisin.
      const y = Math.max(cursor, wanted);
      const placed: LaidNode = {
        ...node,
        x0: round(x0),
        x1: round(x0 + nodeWidth),
        y0: round(y),
        y1: round(y + h),
        labelX: round(x0 + nodeWidth + 6),
        labelRoom: round(last ? labelReserve - 10 : step - nodeWidth - 12),
        labelY: round(y + h / 2),
        leader: false
      };
      laid.set(node.id, placed);
      nodes.push(placed);
      cursor = y + h + gap;
    }

    height = Math.max(height, cursor - gap);
  }

  // Écartement des étiquettes : une descente qui repousse les voisines trop
  // proches, puis une remontée qui rattrape le débordement en bas de colonne.
  for (const col of columns) {
    const placed = col.map((n) => laid.get(n.id)!);
    let floor = -Infinity;
    for (const node of placed) {
      node.labelY = round(Math.max((node.y0 + node.y1) / 2, floor + labelStep));
      floor = node.labelY;
    }
    let ceiling = height;
    for (let i = placed.length - 1; i >= 0; i--) {
      placed[i].labelY = round(Math.min(placed[i].labelY, ceiling - labelStep));
      ceiling = placed[i].labelY;
    }
    for (const node of placed) {
      node.leader = Math.abs(node.labelY - (node.y0 + node.y1) / 2) > 3;
    }
  }

  const links: LaidLink[] = [];
  graph.links.forEach((link, i) => {
    const source = laid.get(link.source);
    const target = laid.get(link.target);
    if (!source || !target) return;
    const w = Math.max(link.value * scale, 1);
    links.push({ ...link, width: round(w), path: ribbon(source.x1, linkTop[i], target.x0, target.y0, w) });
  });

  return { nodes, links, width, height: round(height) };
}

/** Coupe une étiquette à la place disponible, en approchant la largeur des glyphes. */
export function ellipsize(label: string, room: number, charWidth = 5.9): string {
  const max = Math.floor(room / charWidth);
  if (max <= 1) return '';
  if (label.length <= max) return label;
  return label.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

/**
 * Facteur de réduction pour faire tenir un diagramme dans une hauteur imposée.
 * L'export s'en sert : un diagramme plus haut que la page serait coupé en deux
 * par le saut de page, en plein milieu des rubans. Mieux vaut le réduire.
 *
 * La réduction est uniforme — largeur comprise — pour que les étiquettes
 * gardent leur taille relative au dessin et restent lisibles.
 */
export function fitScale(height: number, maxHeight?: number): number {
  if (!maxHeight || maxHeight <= 0 || height <= maxHeight) return 1;
  return maxHeight / height;
}

/**
 * Le chemin qui mène à un nœud : lui-même et tout ce qui le précède, jusqu'aux
 * revenus. C'est ce que le diagramme met en évidence quand on sélectionne une
 * catégorie, une sous-catégorie ou une ligne — d'où vient l'argent qu'elle
 * consomme.
 *
 * Chaque nœud n'a qu'un parent (le graphe est un arbre), donc remonter les
 * liens un à un suffit ; la garde contre les cycles ne coûte rien. Un
 * identifiant absent du graphe — une sélection restée d'un niveau de détail
 * précédent — donne un chemin vide plutôt qu'un nœud fantôme.
 */
export function upstream(graph: Pick<SankeyGraph, 'nodes' | 'links'>, id: string | null): Set<string> {
  const path = new Set<string>();
  if (!id || !graph.nodes.some((n) => n.id === id)) return path;

  const parent = new Map(graph.links.map((l) => [l.target, l.source]));
  for (let current: string | undefined = id; current && !path.has(current); current = parent.get(current)) {
    path.add(current);
  }
  return path;
}

/** Un ruban appartient au chemin quand ses deux extrémités en font partie. */
export function onPath(path: Set<string>, link: Pick<SankeyLink, 'source' | 'target'>): boolean {
  return path.has(link.source) && path.has(link.target);
}
