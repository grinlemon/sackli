import { getContext, setContext } from 'svelte';
import { BudgetState } from '$lib/budget/state.svelte';
import { DEMO_BUDGET, DEMO_CATEGORIES, DEMO_MEMBERS, demoTransactions } from './budget';

/**
 * La démo en cours : un `BudgetState` sans client Supabase, partagé par les
 * vues Budget, Analyse et Export. Créée par le layout de `/demo`, elle survit
 * aux navigations entre ces vues et disparaît avec l'onglet — ni base, ni
 * stockage du navigateur : « rien n'est enregistré » doit être vrai à la lettre.
 *
 * Instanciée dans un composant, jamais au niveau du module : côté serveur, un
 * état de module serait partagé entre tous les visiteurs.
 */
export class DemoSession {
  readonly budget = DEMO_BUDGET;
  readonly members = DEMO_MEMBERS;
  readonly categories = DEMO_CATEGORIES;
  sheet = $state(this.#fresh());

  #fresh() {
    return new BudgetState(null, DEMO_BUDGET.id, demoTransactions(), DEMO_MEMBERS);
  }

  /** Le budget de départ, toutes les modifications oubliées. */
  reset() {
    this.sheet = this.#fresh();
  }

  /** Ce que les vues attendent dans `data`, avec les lignes vivantes de la démo. */
  get data() {
    return {
      supabase: null,
      budget: this.budget,
      members: this.members,
      categories: this.categories,
      transactions: this.sheet.transactions,
      sheet: this.sheet
    };
  }
}

const KEY = Symbol('demo');

export function setDemo(session: DemoSession) {
  setContext(KEY, session);
}

export function getDemo(): DemoSession {
  return getContext<DemoSession>(KEY);
}
