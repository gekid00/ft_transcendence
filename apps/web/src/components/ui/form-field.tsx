/**
 * FormField — primitive that wraps Label + Input + optional helper/error
 * message with the aria wiring already done.
 *
 * Use for simple text-style fields (email, text, search, number, tel, url).
 * For password fields with reveal toggles, file inputs, textareas, or any
 * field with custom inline content, compose Label + Input directly.
 */

import * as React from "react";
import { Input, type InputProps } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export interface FormFieldProps extends Omit<InputProps, "id"> {
  /** Required — used for both <Label htmlFor> and <Input id>. */
  id: string;
  /** Visible label rendered above the input. */
  label: string;
  /** Error message — destructive color, role="alert". Replaces hint. */
  error?: string | null;
  /** Helper text — muted color when there's no error. */
  hint?: string;
}

export function FormField({ id, label, error, hint, ...inputProps }: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = !error && hint ? `${id}-hint` : undefined;
  const describedBy = errorId ?? hintId;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
