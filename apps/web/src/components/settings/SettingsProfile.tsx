/**
 * SettingsProfile — Profile card of the /settings page.
 *
 * Sections (top to bottom):
 *   1. Avatar       — file upload via POST /api/profile/avatar
 *   2. Pawn colour  — auto-save radio pills, PUT /api/profile { pawnSkin }
 *   3. Username     — explicit Save, PUT /api/profile { username }
 *                     with a live availability check via
 *                     GET /api/users/check-username (debounced)
 *   4. Bio          — explicit Save, PUT /api/profile { bio }
 *
 * Each section surfaces its own status (idle / saving / saved / error)
 * inline so a failure on one doesn't poison the others. The page-level
 * concern (auth gate) is handled in settings.astro before mount.
 *
 * The component is purely client-side — the initial state is hydrated
 * from the SSR `initial` prop. No fetch on mount; the user has to
 * interact to trigger a request.
 */

import { useId, useRef, useState, useTransition } from "react";
import { AlertBox } from "~/components/ui/alert-box";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import {
  ProfileApiError,
  checkUsername,
  updateProfile,
  uploadAvatar,
  type ProfileMe,
} from "~/lib/api/profile";

const BIO_MAX = 160;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

type Status = "idle" | "saving" | "saved" | "error";

interface SettingsProfileProps {
  initial: ProfileMe;
}

export function SettingsProfile({ initial }: SettingsProfileProps) {
  // Local copies of the server's state. Updated optimistically on save.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);

  return (
    <section
      aria-labelledby="settings-profile-heading"
      className={cn("rounded-xl border border-border bg-surface text-surface-foreground", "page-reveal p-6 md:p-8")}
      style={{ "--reveal-delay": "0.05s" } as React.CSSProperties}
    >
      <h2 id="settings-profile-heading" className="font-mono text-mono-md uppercase text-foreground">
        Profile
      </h2>

      <div className="mt-6 flex flex-col gap-6">
        <AvatarBlock
          avatarUrl={avatarUrl}
          username={initial.username}
          onUploaded={(url) => setAvatarUrl(url)}
        />
        <UsernameBlock initialUsername={initial.username} />
        <BioBlock initialBio={initial.bio ?? ""} />
      </div>
    </section>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────

function AvatarBlock({
  avatarUrl,
  username,
  onUploaded,
}: {
  avatarUrl: string | null;
  username: string;
  onUploaded: (url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initial = (username[0] ?? "?").toUpperCase();

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      try {
        const { avatarUrl } = await uploadAvatar(file);
        onUploaded(avatarUrl);
        setStatus("saved");
        // Reset the input so picking the same file again still triggers change.
        if (fileInputRef.current) fileInputRef.current.value = "";
        setTimeout(() => setStatus("idle"), 1500);
      } catch (e) {
        const code = e instanceof ProfileApiError ? e.code : "INTERNAL";
        const msg =
          code === "FILE_TOO_LARGE"
            ? "Image must be 2 MB or smaller."
            : code === "INVALID_FILE"
            ? "That file isn't a supported image (JPG, PNG, WebP)."
            : e instanceof ProfileApiError
            ? e.message
            : "Upload failed";
        setError(msg);
        setStatus("error");
      }
    });
  }

  return (
    <div className="flex items-center gap-5">
      {/*
        Avatar itself is a non-interactive preview (a div, not a button).
        Earlier this was a button that opened the file picker on click, but
        that hid what the user could actually do — the dedicated "Upload
        picture" button is the only affordance. Clicking the avatar does
        nothing now. No camera badge either: a non-interactive portrait
        shouldn't have to advertise interactivity it doesn't have, and
        the button next to it already says "Upload picture" in plain text.
        The endpoint also returned 400 in /settings (worked in onboarding)
        — see the uploadAvatar fix in lib/api/profile.ts.
      */}
      <div
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-foreground"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <span className="font-display italic text-4xl text-background">
            {initial}
          </span>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        className="sr-only"
      />
      <div className="flex flex-col gap-2">
        <p className="font-mono text-mono-sm uppercase text-muted-foreground">Avatar</p>
        <Button
          type="button"
          variant="brand-outline"
          size="pill"
          onClick={pickFile}
          disabled={isPending}
        >
          {isPending ? "Uploading…" : "Upload picture"}
        </Button>
        <p className="font-mono text-mono-sm uppercase text-muted-foreground">
          {status === "saved"
            ? "Saved"
            : status === "saving"
            ? "Uploading…"
            : "PNG, JPEG, WebP · up to 2 MB"}
        </p>
        {status === "error" && error ? <AlertBox>{error}</AlertBox> : null}
      </div>
    </div>
  );
}



// ─── Username (Save + live availability check) ────────────────────────

function UsernameBlock({ initialUsername }: { initialUsername: string }) {
  const inputId = useId();
  // Lift the saved value to state so a successful save patches isDirty
  // and the hint logic naturally drops back to the default ("3–30 chars…")
  // instead of re-showing the stale "Available ✓" that the user just acted
  // on. Without this, "Available ✓" would zombie back ~1.5s after Save once
  // status returned to idle, which doesn't make sense — the user took that
  // username, it's no longer "available", it's theirs.
  const [savedUsername, setSavedUsername] = useState(initialUsername);
  const [value, setValue] = useState(initialUsername);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<
    "unknown" | "checking" | "available" | "taken" | "invalid"
  >("unknown");
  const [isPending, startTransition] = useTransition();
  const isDirty = value !== savedUsername;
  const isValid = USERNAME_RE.test(value);

  function handleSave() {
    if (!isDirty || !isValid) return;
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile({ username: value });
        setSavedUsername(value);
        setAvailability("unknown");
        setStatus("saved");
        // The page itself doesn't re-render (no data-flow into the parent
        // card), but the TopNav is server-rendered and so is stale on the
        // username. We dispatch a custom event the TopNav script listens
        // for and patches its DOM in place. Cleaner than a full reload:
        // no flash, no scroll reset, no SSR roundtrip.
        window.dispatchEvent(
          new CustomEvent("username-changed", { detail: { username: value } }),
        );
        setTimeout(() => setStatus("idle"), 1500);
      } catch (e) {
        const code = e instanceof ProfileApiError ? e.code : "INTERNAL";
        const msg =
          code === "USERNAME_TAKEN"
            ? "That username is already taken."
            : code === "INVALID_USERNAME"
            ? "3–30 chars · letters, numbers, underscore."
            : e instanceof ProfileApiError
            ? e.message
            : "Save failed";
        setError(msg);
        setStatus("error");
      }
    });
  }

  // Lightweight debounce for the availability check. We only check when
  // the value is well-formed and different from the saved one.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onChange(next: string) {
    setValue(next);
    setStatus("idle");
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next === savedUsername) {
      setAvailability("unknown");
      return;
    }
    if (!USERNAME_RE.test(next)) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    debounceRef.current = setTimeout(() => {
      checkUsername(next)
        .then((r) => setAvailability(r.available ? "available" : "taken"))
        .catch(() => setAvailability("unknown"));
    }, 400);
  }

  const availabilityLabel: Record<typeof availability, string> = {
    unknown:   "3–30 chars · letters, numbers, underscore",
    checking:  "Checking…",
    available: "Available ✓",
    taken:     "Already taken",
    invalid:   "Invalid format",
  };
  // Color choices follow the design tokens (apps/web/DESIGN.md §1.1):
  //   - pawn-yellow is reserved for the AI pawn — the only yellow on the
  //     page. Reusing it for "Available" was wrong: it carries the visual
  //     weight of the AI pawn and reads as a warning, not confirmation.
  //   - There's no success/green token in the system; "Available ✓" and
  //     "Saved ✓" rely on the checkmark glyph as the visual cue and
  //     text-foreground (primary) for emphasis.
  //   - destructive stays for the two error states.
  //   - muted-foreground for the default hint and the in-flight "Checking…".
  //
  // The class is derived from the hint state, not the availability enum,
  // so "Saved ✓" stays in the right color even when availability is
  // reset to "unknown" on save success.
  const hint =
    status === "saving" ? "Saving…"
    : status === "saved" ? "Saved ✓"
    : isDirty ? availabilityLabel[availability]
    : availabilityLabel.unknown;
  const hintClass = (() => {
    if (status === "saving") return "text-muted-foreground";
    if (status === "saved") return "text-foreground";
    if (availability === "available") return "text-foreground";
    if (availability === "taken" || availability === "invalid") return "text-destructive";
    return "text-muted-foreground";
  })();

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-6">
      <Label htmlFor={inputId}>Username</Label>
      <Input
        id={inputId}
        type="text"
        name="username"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={availability === "taken" || availability === "invalid" ? true : undefined}
        aria-describedby={`${inputId}-hint`}
      />
      <div className="flex items-center justify-between gap-3">
        <p
          id={`${inputId}-hint`}
          className={cn("font-mono text-mono-sm uppercase", hintClass)}
        >
          {hint}
        </p>
        <Button
          type="button"
          variant="brand-outline"
          size="pill"
          onClick={handleSave}
          disabled={!isDirty || !isValid || isPending}
          className="shrink-0"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>
      {status === "error" && error ? <AlertBox>{error}</AlertBox> : null}
    </div>
  );
}

// ─── Bio (Save) ───────────────────────────────────────────────────────

function BioBlock({ initialBio }: { initialBio: string }) {
  const textareaId = useId();
  const [value, setValue] = useState(initialBio);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isDirty = value !== initialBio;
  const tooLong = value.length > BIO_MAX;

  function handleSave() {
    if (!isDirty || tooLong) return;
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile({ bio: value });
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch (e) {
        const msg = e instanceof ProfileApiError ? e.message : "Save failed";
        setError(msg);
        setStatus("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-6">
      <Label htmlFor={textareaId}>Bio</Label>
      <textarea
        id={textareaId}
        name="bio"
        rows={3}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
          setError(null);
        }}
        placeholder="A line or two about your style…"
        className={cn(
          "w-full rounded-md border border-border bg-input px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground",
          "min-h-[80px] resize-none",
          tooLong ? "border-destructive" : "",
        )}
        aria-invalid={tooLong ? true : undefined}
        aria-describedby={tooLong ? `${textareaId}-error` : undefined}
      />
      <div className="flex items-center justify-between gap-3">
        <p
          id={`${textareaId}-error`}
          className={cn(
            "font-mono text-mono-sm uppercase",
            tooLong ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {tooLong
            ? `${value.length} / ${BIO_MAX} — too long`
            : status === "saved"
            ? "Saved"
            : status === "saving"
            ? "Saving…"
            : `${value.length} / ${BIO_MAX}`}
        </p>
        <Button
          type="button"
          variant="brand-outline"
          size="pill"
          onClick={handleSave}
          disabled={!isDirty || tooLong || isPending}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>
      {status === "error" && error ? <AlertBox>{error}</AlertBox> : null}
    </div>
  );
}
