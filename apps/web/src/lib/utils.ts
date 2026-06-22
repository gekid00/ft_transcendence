/**
 * cn — class-name composer used across every shadcn primitive.
 * clsx handles conditional classes; tailwind-merge dedupes conflicting Tailwind classes
 * (e.g. `cn("px-2", "px-4")` → `"px-4"`).
 *
 * twMerge is extended with our custom font-size keys defined in globals.css's
 * @theme block (--text-display, --text-display-mobile, --text-metric,
 * --text-mono-sm, --text-mono-md). Without this, twMerge classifies
 * `text-mono-sm` as a text-color utility by default and drops conflicting
 * actual text-color utilities (e.g. `text-background`) — making the styled
 * text vanish on filled buttons.
 */
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "display-mobile", "metric", "mono-sm", "mono-md"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
