/**
 * SettingsPrivacy — Privacy card of the /settings page.
 *
 * Stub for now. The "who can challenge me" / "who can DM me" radios
 * and the block list all need backend support (see HANDOFF §3.5 +
 * /api/blocked endpoint) plus new schema columns on the users table.
 *
 * Renders the same card chrome and `.page-reveal` animation as the
 * other three settings cards so the layout doesn't shift when this
 * becomes real. Renders a single 'coming soon' notice with a link
 * into the backend handoff doc so reviewers see the rationale.
 */

import { cn } from "~/lib/utils";

export function SettingsPrivacy() {
  return (
    <section
      aria-labelledby="settings-privacy-heading"
      className={cn("rounded-xl border border-border bg-surface text-surface-foreground", "page-reveal p-6 md:p-8")}
      style={{ "--reveal-delay": "0.2s" } as React.CSSProperties}
    >
      <h2 id="settings-privacy-heading" className="font-mono text-mono-md uppercase text-foreground">
        Privacy
      </h2>
      <p className="mt-2 font-sans text-sm text-muted-foreground">
        Backend support pending — see{" "}
        <a
          href="https://github.com/iluvshiwoon/ft_transcendence/blob/main/HANDOFF_BACKEND.md#35--friends-enrichi"
          className="font-bold underline underline-offset-4 transition-opacity hover:opacity-70 focus-visible:opacity-70"
          target="_blank"
          rel="noopener noreferrer"
        >
          HANDOFF §3.5
        </a>{" "}
        and the friends / blocked-users endpoints. UI is built ahead so
        the experience can be reviewed; schema columns for
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-mono-sm">who_can_challenge</code>{" "}
        and{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-mono-sm">who_can_dm</code>{" "}
        ship in a follow-up.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2 opacity-50">
          <p className="font-mono text-mono-sm uppercase text-muted-foreground">Who can challenge me</p>
          <ul role="radiogroup" aria-label="Who can challenge" aria-disabled="true" className="flex flex-wrap gap-2">
            {["Everyone", "Friends", "Nobody"].map((label) => (
              <li key={label}>
                <button
                  type="button"
                  role="radio"
                  aria-checked="false"
                  disabled
                  className="px-3 py-1 rounded-full font-mono text-mono-sm uppercase border border-border bg-muted text-muted-foreground cursor-not-allowed"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 opacity-50">
          <p className="font-mono text-mono-sm uppercase text-muted-foreground">Who can DM me</p>
          <ul role="radiogroup" aria-label="Who can DM" aria-disabled="true" className="flex flex-wrap gap-2">
            {["Everyone", "Friends", "Nobody"].map((label) => (
              <li key={label}>
                <button
                  type="button"
                  role="radio"
                  aria-checked="false"
                  disabled
                  className="px-3 py-1 rounded-full font-mono text-mono-sm uppercase border border-border bg-muted text-muted-foreground cursor-not-allowed"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-6 opacity-50">
          <div className="min-w-0">
            <p className="font-mono text-mono-sm uppercase text-muted-foreground">Block list</p>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              No users blocked
            </p>
          </div>
          <button
            type="button"
            disabled
            className="shrink-0 rounded-full border border-border bg-muted px-5 py-1.5 font-mono text-mono-sm uppercase text-muted-foreground cursor-not-allowed"
          >
            Manage
          </button>
        </div>
      </div>
    </section>
  );
}
