/**
 * Public leaderboard store for the landing page.
 *
 * Two React islands subscribe to this store:
 *   - <Leaderboard>        renders the top-6 ranked users
 *   - <EndGameOverlay>     looks up the user's rank against the same list
 *
 * Mirrors the shape of `playStore` (useSyncExternalStore + class singleton)
 * so the two islands share the same data without prop drilling or refetching.
 *
 * Data source: GET /api/leaderboard?limit=6 (public, no auth).
 * The endpoint ordering is `rating DESC, peak_rating DESC, id ASC` and
 * matches `getUserRank()` server-side, so the ranks are consistent with
 * the authed user's /me.rank.
 *
 * `ensureLoaded()` is idempotent — safe to call from multiple components.
 * The landing page calls it from <Leaderboard>'s useEffect.
 */

type Listener = () => void;

export type Title =
  | "Beginner"
  | "Apprentice"
  | "Expert"
  | "Master"
  | "Grandmaster";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  rating: number;
  peakRating: number;
  winRate: number;
  title: Title;
  gamesPlayed: number;
}

export interface LeaderboardStoreState {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
}

const initialState: LeaderboardStoreState = {
  entries: [],
  loading: false,
  error: null,
};

/** Mirrors the server-side default. Keep in sync with leaderboard.ts. */
const DEFAULT_LIMIT = 6;

class LeaderboardStore {
  private state: LeaderboardStoreState = initialState;
  private listeners = new Set<Listener>();
  private loadPromise: Promise<void> | null = null;

  getSnapshot = (): LeaderboardStoreState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private set(patch: Partial<LeaderboardStoreState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /**
   * Idempotent. Fires exactly one fetch even if called from many
   * components in the same render. Uses relative URL — Astro dev
   * proxies /api to the backend via the same-origin /api/* rewrite
   * configured at the project root, and the production build serves
   * the API behind the same origin too.
   */
  ensureLoaded = async (limit: number = DEFAULT_LIMIT): Promise<void> => {
    if (this.state.entries.length > 0) return;
    if (this.loadPromise) return this.loadPromise;
    this.set({ loading: true, error: null });
    this.loadPromise = (async () => {
      try {
        const res = await fetch(`/api/leaderboard?limit=${limit}`, {
          credentials: "omit",
        });
        if (!res.ok) {
          this.set({
            loading: false,
            error: `HTTP ${res.status}`,
          });
          return;
        }
        const body = (await res.json()) as { entries: LeaderboardEntry[] };
        this.set({ entries: body.entries ?? [], loading: false, error: null });
      } catch (err) {
        this.set({
          loading: false,
          error: err instanceof Error ? err.message : "fetch failed",
        });
      } finally {
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  };

  /** Test/SSR escape hatch. Not used in production code. */
  reset = (): void => {
    this.state = initialState;
    this.loadPromise = null;
    for (const fn of this.listeners) fn();
  };
}

export const leaderboardStore = new LeaderboardStore();
