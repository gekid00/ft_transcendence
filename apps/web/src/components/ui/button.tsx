/**
 * Button — shadcn primitive, extended with 4thewin's brand variants.
 *
 * Canonical shadcn API (variant + size + asChild + className) so any future
 * `pnpm dlx shadcn@latest add <thing>` that depends on Button works without
 * surgery.
 *
 * 4thewin extensions:
 *   - variant "brand-filled" / "brand-outline": filled-↔-outlined hover dance
 *     used by the Login / Sign up buttons in TopNav.
 *   - size "pill": rounded-full + mono-uppercase typography for nav CTAs.
 *
 * React 19: refs are regular props (no forwardRef).
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-all duration-75 ease-linear",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-background text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        link: "text-accent underline-offset-4 hover:underline",
        // 4thewin brand: filled CTA that inverts to outlined on hover
        "brand-filled":
          "border border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground active:scale-[0.98]",
        // 4thewin brand: outlined CTA that inverts to filled on hover
        "brand-outline":
          "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm rounded-md",
        sm: "h-9 px-3 text-sm rounded-md",
        lg: "h-11 px-8 text-base rounded-md",
        icon: "size-9 rounded-full",
        // 4thewin nav pill: rounded-full + mono-uppercase
        pill: "h-9 px-5 rounded-full font-mono text-mono-sm uppercase",
        xs: "h-7 px-3 text-xs rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
}

export { buttonVariants };
