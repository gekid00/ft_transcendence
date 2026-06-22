/**
 * Shared password strength scoring — used by both signup (Step2Credentials)
 * and settings (PasswordEditForm). Keep these two consumers in sync:
 * the strength meter and the form's submit button both branch on the
 * same score.
 *
 * Scoring rules (matches the original Step2Credentials implementation,
 * preserved verbatim to avoid visual drift between signup and settings):
 *
 *   0  empty input
 *   1  length < 8                     → "Too short"
 *   2  length >= 8, variety <= 1      → "Fair"
 *   3  length >= 8, variety === 2     → "Good"
 *   4  length >= 8, variety >= 3      → "Strong"
 *
 * Variety is the count of distinct character classes present: lowercase,
 * uppercase, digit, non-alphanumeric.
 */

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

export const PASSWORD_MIN = 8;

export function passwordStrength(p: string): PasswordStrength {
  if (p.length === 0) return { score: 0, label: "" };
  if (p.length < PASSWORD_MIN) return { score: 1, label: "Too short" };
  let variety = 0;
  if (/[a-z]/.test(p)) variety++;
  if (/[A-Z]/.test(p)) variety++;
  if (/[0-9]/.test(p)) variety++;
  if (/[^a-zA-Z0-9]/.test(p)) variety++;
  if (variety <= 1) return { score: 2, label: "Fair" };
  if (variety === 2) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}

/**
 * Human-friendly "last changed" label. Returns:
 *   - "—"               when null (account has never set a password, or
 *                        the field isn't tracked — OAuth-only accounts)
 *   - "just now"        when < 60 s
 *   - "5 min ago"       when < 1 h
 *   - "3 hours ago"     when < 24 h
 *   - "yesterday"       when 1 day ago (between 24 h and 48 h)
 *   - "5 days ago"      when < 30 days
 *   - "Mar 12"          when same year
 *   - "Mar 12, 2025"    when different year
 *
 * Kept in English to match the rest of the app's code comments; the UI
 * is French but this is just a tiny relative-time helper for one card.
 */
export function lastChangedLabel(at: string | null | undefined): string {
  if (!at) return "—";
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 0) return "just now"; // clock skew — be charitable
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay} days ago`;

  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
