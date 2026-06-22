/**
 * AlertBox — form-level alert with optional inline action link.
 *
 * Replaces the duplicated <p role="alert"> + inline link markup that was
 * showing up in every auth form (LoginForm, Step2Credentials, future ones).
 *
 * Variants:
 *   - "error" (default): destructive color, role="alert" (announced).
 *   - "info":            muted color, no role (visual only).
 *
 * The action link inherits text color from the alert (red in error variant,
 * muted in info), bold-underlined, hover dims via opacity.
 */

import * as React from "react";
import { cn } from "~/lib/utils";

interface AlertAction {
  label: string;
  href: string;
}

export interface AlertBoxProps {
  variant?: "error" | "info";
  /** Optional inline link rendered after the message text. */
  action?: AlertAction;
  children: React.ReactNode;
}

export function AlertBox({ variant = "error", action, children }: AlertBoxProps) {
  return (
    <p
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "text-sm",
        variant === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
      {action ? (
        <>
          {" "}
          <a
            href={action.href}
            className="font-bold underline underline-offset-4 transition-opacity hover:opacity-70 focus-visible:opacity-70"
          >
            {action.label}
          </a>
        </>
      ) : null}
    </p>
  );
}
