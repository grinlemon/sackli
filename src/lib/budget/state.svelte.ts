import type { SupabaseClient } from '@supabase/supabase-js';
import type { BudgetMember, Transaction } from '$lib/types';
import { defaultWeights } from './calc';

const DEBOUNCE_MS = 400;

/**
 * État local de la grille : mise à jour optimiste immédiate, écriture différée.
 * Les champs libres sont debouncés pour ne pas écrire à chaque frappe.
 *
 * Sans client Supabase (`null`), c'est la démo : la mise à jour locale a lieu
 * comme d'habitude, mais aucune écriture n'est jamais programmée. Le budget
 * vit le temps de l'onglet, et nulle part ailleurs.
 */
export class BudgetState {
  transactions = $state<Transaction[]>([]);
  error = $state<string | null>(null);

  #supabase: SupabaseClient | null;
  #budgetId: string;
  #members: BudgetMember[];
  #pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => PromiseLike<unknown> }>();

  constructor(
    supabase: SupabaseClient | null,
    budgetId: string,
    transactions: Transaction[],
    members: BudgetMember[]
  ) {
    this.#supabase = supabase;
    this.#budgetId = budgetId;
    // Copie défensive : la grille ne doit pas muter le tableau venu du load.
    this.transactions = transactions.map((t) => ({ ...t }));
    this.#members = members;
  }

  /** Le client, pour les écritures — que `#schedule` ne lance jamais en démo. */
  get #db(): SupabaseClient {
    return this.#supabase!;
  }

  #schedule(key: string, run: () => PromiseLike<unknown>, delay = DEBOUNCE_MS) {
    if (!this.#supabase) return;
    clearTimeout(this.#pending.get(key)?.timer);
    const timer = setTimeout(() => void this.#fire(key), delay);
    this.#pending.set(key, { timer, run });
  }

  async #fire(key: string) {
    const entry = this.#pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.#pending.delete(key);

    const { error } = (await entry.run()) as { error?: { message: string } | null };
    this.error = error ? `Enregistrement impossible : ${error.message}` : null;
  }

  /** Exécute immédiatement les écritures en attente — pas d'annulation silencieuse. */
  async flush() {
    await Promise.all([...this.#pending.keys()].map((key) => this.#fire(key)));
  }

  get saving() {
    return this.#pending.size > 0;
  }

  patch(id: string, fields: Partial<Transaction>, delay = DEBOUNCE_MS) {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return;
    Object.assign(tx, fields);

    const { splits, ...persisted } = fields as Partial<Transaction> & { splits?: unknown };
    void splits;
    this.#schedule(
      `tx:${id}`,
      () => this.#db.from('transactions').update(persisted).eq('id', id),
      delay
    );
  }

  /**
   * Changer le membre rattaché remet la répartition à son défaut : on supprime
   * les splits explicites plutôt que d'écrire des poids que l'utilisateur n'a pas choisis.
   */
  setMember(id: string, memberId: string | null) {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return;
    tx.member_id = memberId;
    tx.splits = [];
    // Une répartition encore en attente visait l'ancien rattachement : la
    // rejouer après la suppression ci-dessous réécrirait des poids périmés.
    clearTimeout(this.#pending.get(`splits:${id}`)?.timer);
    this.#pending.delete(`splits:${id}`);

    this.#schedule(
      `member:${id}`,
      async () => {
        await this.#db.from('transaction_splits').delete().eq('transaction_id', id);
        return this.#db.from('transactions').update({ member_id: memberId }).eq('id', id);
      },
      0
    );
  }

  /** Écrit une répartition explicite (le curseur a bougé). */
  setWeights(id: string, weights: Map<string, number>) {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return;

    const rows = [...weights].map(([member_id, weight]) => ({
      transaction_id: id,
      member_id,
      weight
    }));
    tx.splits = rows;

    this.#schedule(`splits:${id}`, async () => {
      await this.#db.from('transaction_splits').delete().eq('transaction_id', id);
      return this.#db.from('transaction_splits').insert(rows);
    });
  }

  /**
   * Revient au défaut implicite (100 % pour le membre rattaché, parts égales si
   * commun) en supprimant les splits, plutôt que d'écrire ce qui va de soi.
   * Même clé d'écriture que `setWeights` : une écriture en attente sur cette
   * ligne est remplacée, pas rejouée après.
   */
  clearWeights(id: string) {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return;
    tx.splits = [];
    this.#schedule(`splits:${id}`, () =>
      this.#db.from('transaction_splits').delete().eq('transaction_id', id)
    );
  }

  /** Curseur à deux membres : pct = part du membre #1. */
  setSliderPercent(id: string, pct: number) {
    if (this.#members.length !== 2) return;
    this.setWeights(
      id,
      new Map([
        [this.#members[0].id, Math.round(pct)],
        [this.#members[1].id, 100 - Math.round(pct)]
      ])
    );
  }

  resetWeights(id: string) {
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return;
    this.setWeights(id, defaultWeights(tx.member_id, this.#members));
  }

  async add() {
    const position = this.transactions.reduce((max, t) => Math.max(max, t.position), -1) + 1;
    const draft = {
      budget_id: this.#budgetId,
      name: 'Nouvelle prévision',
      kind: 'expense' as const,
      amount: 0,
      category_id: null,
      frequency: 'monthly' as const,
      member_id: null,
      account: null,
      position
    };

    if (!this.#supabase) {
      const tx: Transaction = { ...draft, id: crypto.randomUUID(), splits: [] };
      this.transactions.push(tx);
      return tx.id;
    }

    const { data, error } = await this.#db
      .from('transactions')
      .insert(draft)
      .select(
        'id, budget_id, name, kind, amount, category_id, frequency, member_id, account, position'
      )
      .single();

    if (error || !data) {
      this.error = `Ajout impossible : ${error?.message ?? 'inconnu'}`;
      return null;
    }

    const tx = { ...data, amount: Number(data.amount), splits: [] } as Transaction;
    this.transactions.push(tx);
    return tx.id;
  }

  async remove(id: string) {
    const index = this.transactions.findIndex((t) => t.id === id);
    if (index === -1) return;
    const [removed] = this.transactions.splice(index, 1);
    if (!this.#supabase) return;

    const { error } = await this.#db.from('transactions').delete().eq('id', id);
    if (error) {
      this.transactions.splice(index, 0, removed); // rollback
      this.error = `Suppression impossible : ${error.message}`;
    }
  }
}
