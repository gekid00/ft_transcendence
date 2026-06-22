/**
 * Step2Credentials — email / username / password form.
 *
 * Validation philosophy:
 *   - Show errors on blur (touched=true), not while the user is typing the
 *     first time.
 *   - Password strength indicator updates LIVE (not gated on touched) — it's
 *     guidance, not an error.
 *   - Submit is disabled until everything's valid; the button label gets a
 *     "fix the form" hint via aria-describedby when disabled.
 *
 * Composition (vercel-composition-patterns):
 *   - Errors render as sibling <p role="alert"> with aria-describedby. Input
 *     primitive styles itself via aria-invalid (no boolean error prop).
 *
 * Performance (vercel-react-best-practices):
 *   - Strength + validation flags are derived in render (rerender-derived-
 *     state-no-effect), not stored in state via useEffect.
 *   - useTransition for submit (rerender-transitions).
 *   - Functional setState (rerender-functional-setstate) where applicable.
 */

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { AlertBox } from "~/components/ui/alert-box";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { PASSWORD_MIN, passwordStrength } from "~/lib/password";
import { cn } from "~/lib/utils";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ServerErrors = Partial<Record<"email" | "username" | "password" | "form", string>>;
type Touched = Partial<Record<"email" | "username" | "password", boolean>>;

export function Step2Credentials() {
  const emailId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const passwordHelpId = useId();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [touched, setTouched] = useState<Touched>({});
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  // Derived during render — no useEffect.
  const emailIsValid = EMAIL_RE.test(email);
  const usernameIsValid = USERNAME_RE.test(username);
  const passwordIsValid = password.length >= PASSWORD_MIN;
  const strength = passwordStrength(password);

  const showEmailError =
    (touched.email && !emailIsValid && email.length > 0) || Boolean(serverErrors.email);
  const emailErrorMsg =
    serverErrors.email ??
    (touched.email && !emailIsValid && email.length > 0
      ? "Use a valid email like name@example.com."
      : "");

  const showUsernameError =
    Boolean(serverErrors.username) ||
    (touched.username && username.length > 0 && !usernameIsValid) ||
    usernameTaken === true;
  const usernameErrorMsg =
    serverErrors.username ??
    (usernameTaken === true
      ? "That username is taken."
      : touched.username && username.length > 0 && !usernameIsValid
        ? "3–30 characters, letters, numbers, underscore."
        : "");

  const showPasswordError =
    Boolean(serverErrors.password) || (touched.password && password.length > 0 && !passwordIsValid);
  const passwordErrorMsg =
    serverErrors.password ??
    (touched.password && password.length > 0 && !passwordIsValid ? "At least 8 characters." : "");

  const canSubmit =
    emailIsValid && usernameIsValid && passwordIsValid && usernameTaken !== true && !isPending;

  async function checkUsername(value: string) {
    if (!USERNAME_RE.test(value)) {
      setUsernameTaken(null);
      return;
    }
    try {
      // Public endpoint (no auth) — returns just { available: boolean }.
      const res = await fetch(`/api/users/check-username?q=${encodeURIComponent(value)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setUsernameTaken(null);
        return;
      }
      const { available } = (await res.json()) as { available: boolean };
      setUsernameTaken(!available);
    } catch {
      // Endpoint unavailable — let the user proceed; signup will surface a 409 later.
      setUsernameTaken(null);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Mark all touched so any pending validation messages show.
    setTouched({ email: true, username: true, password: true });
    if (!canSubmit) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, username, password }),
        });
        if (res.status === 201) {
          window.location.href = "/signup?step=3";
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409 && data.error?.toLowerCase().includes("username")) {
          // Username conflicts are explicit — usernames are public anyway.
          setServerErrors({ username: "Username already taken." });
          setUsernameTaken(true);
          setShowSignInPrompt(false);
        } else if (res.status === 409) {
          // Any other 409 (typically email already registered, but we don't
          // confirm which) — generic form-level error + sign-in suggestion.
          // Avoids enumerating registered emails.
          setServerErrors({ form: "Couldn't create your account." });
          setShowSignInPrompt(true);
        } else if (res.status === 400) {
          setServerErrors({ form: data.error ?? "Check your inputs and try again." });
          setShowSignInPrompt(false);
        } else {
          setServerErrors({ form: "Something went wrong. Try again." });
          setShowSignInPrompt(false);
        }
      } catch {
        setServerErrors({ form: "Network error. Check your connection." });
        setShowSignInPrompt(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <header className="flex flex-col gap-3">
        <h1 className="font-display italic font-light tracking-wide text-3xl text-foreground leading-none">
          Create your account
        </h1>
        <p className="text-base text-muted-foreground">
          Email, username, password. Three fields, then you're in.
        </p>
      </header>

      {/* Email */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setServerErrors((s) => ({ ...s, email: undefined }));
          }}
          onBlur={() => setTouched((s) => ({ ...s, email: true }))}
          aria-invalid={showEmailError ? true : undefined}
          aria-describedby={showEmailError ? `${emailId}-error` : undefined}
        />
        {showEmailError ? (
          <p id={`${emailId}-error`} role="alert" className="text-sm text-destructive">
            {emailErrorMsg}
          </p>
        ) : null}
      </div>

      {/* Username */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={usernameId}>Username</Label>
        <Input
          id={usernameId}
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={30}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameTaken(null);
            setServerErrors((s) => ({ ...s, username: undefined }));
          }}
          onBlur={(e) => {
            setTouched((s) => ({ ...s, username: true }));
            checkUsername(e.target.value);
          }}
          aria-invalid={showUsernameError ? true : undefined}
          aria-describedby={`${usernameId}-status`}
        />
        {showUsernameError ? (
          <p id={`${usernameId}-status`} role="alert" className="text-sm text-destructive">
            {usernameErrorMsg}
          </p>
        ) : usernameTaken === false && usernameIsValid ? (
          <p id={`${usernameId}-status`} className="text-sm text-muted-foreground">
            Available.
          </p>
        ) : (
          <p id={`${usernameId}-status`} className="text-sm text-muted-foreground">
            3–30 characters, letters, numbers, underscore.
          </p>
        )}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Password</Label>
        <div className="relative">
          <Input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setServerErrors((s) => ({ ...s, password: undefined }));
            }}
            onBlur={() => setTouched((s) => ({ ...s, password: true }))}
            aria-invalid={showPasswordError ? true : undefined}
            aria-describedby={passwordHelpId}
            className="pr-12"
          />
          {/* Reveal toggle. Full-height clickable strip; aria-pressed for state. */}
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 z-10 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Strength indicator — 4 segments. Only renders once user starts typing. */}
        {password.length > 0 ? (
          <div className="flex flex-col gap-1.5 pt-3">
            <div className="flex gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-150",
                    seg <= strength.score ? "bg-foreground" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <p
              id={passwordHelpId}
              className={cn(
                "text-sm",
                showPasswordError ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {showPasswordError
                ? passwordErrorMsg
                : strength.label
                  ? `Strength: ${strength.label}`
                  : ""}
            </p>
          </div>
        ) : (
          <p id={passwordHelpId} className="text-sm text-muted-foreground">
            At least 8 characters.
          </p>
        )}
      </div>

      {serverErrors.form ? (
        <AlertBox
          action={showSignInPrompt ? { label: "Sign in instead?", href: "/login" } : undefined}
        >
          {serverErrors.form}
        </AlertBox>
      ) : null}

      {/* Actions */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <a
          href="/signup?step=1"
          className="font-mono text-mono-sm uppercase text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </a>
        <Button
          type="submit"
          variant="brand-filled"
          size="pill"
          disabled={!canSubmit}
          className="hover:bg-foreground/90 hover:text-background"
        >
          Continue →
        </Button>
      </div>
    </form>
  );
}
