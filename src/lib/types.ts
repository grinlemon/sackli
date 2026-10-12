export type TxKind = 'income' | 'expense';
export type Frequency = 'monthly' | 'yearly';

export interface Budget {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface BudgetMember {
  id: string;
  budget_id: string;
  user_id: string | null;
  invite_email: string | null;
  display_name: string;
  position: number;
}

export interface TransactionSplit {
  transaction_id: string;
  member_id: string;
  weight: number;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  /** null = catégorie racine ; sinon sous-catégorie de cette racine. */
  parent_id: string | null;
  name: string;
  /** Portée par la racine seule ; les sous-catégories héritent de sa teinte. */
  color: string | null;
  position: number;
}

/** Une racine et ses sous-catégories, pour l'affichage groupé. */
export interface CategoryTree {
  root: BudgetCategory;
  children: BudgetCategory[];
}

export function categoryTree(categories: BudgetCategory[]): CategoryTree[] {
  return categories
    .filter((c) => c.parent_id === null)
    .map((root) => ({
      root,
      children: categories.filter((c) => c.parent_id === root.id)
    }));
}

export interface Transaction {
  id: string;
  budget_id: string;
  name: string;
  kind: TxKind;
  amount: number;
  /** null = ligne non classée. */
  category_id: string | null;
  frequency: Frequency;
  /** null = dépense commune ; sinon la ligne est rattachée à ce membre. */
  member_id: string | null;
  account: string | null;
  position: number;
  splits: TransactionSplit[];
}

/** État d'un membre vis-à-vis d'un compte utilisateur. */
export type MemberStatus = 'linked' | 'invited' | 'offline';

export function memberStatus(m: BudgetMember): MemberStatus {
  if (m.user_id) return 'linked';
  if (m.invite_email) return 'invited';
  return 'offline';
}
