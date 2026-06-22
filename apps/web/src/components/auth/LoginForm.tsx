/**
 * LoginForm — email/password sign-in for /login.
 *
 * Mirrors Step2Credentials' patterns (controlled inputs, useTransition,
 * aria-invalid on validation errors) but simpler — no live username check,
 * no password strength meter, no OAuth state cookie. Submit hits
 * POST /api/auth/login; on 200 we redirect to / (the cookie is already
 * set HttpOnly by the backend).
 *
 * The 'Continue with 42' button and 'Don't have an account? Sign up' link
 * are rendered by the parent /login.astro page — they're static markup, no
 * reason to re-hydrate them with the form.
 */

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { AlertBox } from "~/components/ui/alert-box";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [isPending, startTransition] = useTransition();

  // Derived in render — no useEffect.
  const emailValid = EMAIL_RE.test(email);
  const passwordPresent = password.length > 0;

  const showEmailError = touched.email && email.length > 0 && !emailValid;
  const showPasswordError = touched.password && !passwordPresent;

  const canSubmit = emailValid && passwordPresent && !isPending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (!canSubmit) return;

    // Note: we deliberately don't `setError(null)` here. If a previous
    // attempt failed, the error stays visible during the in-flight fetch
    // (avoids a brief flicker as the alert disappears and reappears when
    // the new response arrives ~50-200ms later). The error is cleared on
    // input changes via the onChange handlers below.

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (res.ok) {
          window.location.href = "/";
          return;
        }
        if (res.status === 401) {
          setError("Wrong email or password.");
        } else if (res.status === 400) {
          setError("Check your inputs and try again.");
        } else {
          setError("Something went wrong. Try again.");
        }
      } catch {
        setError("Network error. Check your connection.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <header className="flex flex-col gap-4">
        <h1 className="font-display italic font-light tracking-wide text-3xl text-foreground leading-none">
          Welcome back
        </h1>
        <p className="text-base text-muted-foreground">
          Sign in to continue.
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
            setError(null);
          }}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          aria-invalid={showEmailError ? true : undefined}
          aria-describedby={showEmailError ? `${emailId}-error` : undefined}
        />
        {showEmailError ? (
          <p id={`${emailId}-error`} role="alert" className="text-sm text-destructive">
            Use a valid email like name@example.com.
          </p>
        ) : null}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Password</Label>
        <div className="relative">
          <Input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            aria-invalid={showPasswordError ? true : undefined}
            className="pr-12"
          />
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
        {showPasswordError ? (
          <p role="alert" className="text-sm text-destructive">
            Enter your password.
          </p>
        ) : null}
      </div>

      {/* Server-side error */}
      {error ? <AlertBox>{error}</AlertBox> : null}

      {/* Submit. Overrides the brand-filled variant's hover inversion
          (dark→outlined dance) — that flicker was visible on retries
          when the cursor stayed over the button as it transitioned
          from disabled back to enabled. Keeps a subtle hover darken
          for the affordance. Text is intentionally constant ("Sign in →"
          not "Signing in…"); the disabled-state fade is the only
          pending indicator, since text-content swaps caused a second
          visible flicker. */}
      <Button
        type="submit"
        variant="brand-filled"
        size="pill"
        disabled={!canSubmit}
        className="hover:bg-foreground/90 hover:text-background"
      >
        Sign in →
      </Button>
    </form>
  );
}
