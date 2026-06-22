import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "~/lib/utils";
import { buttonVariants } from "~/components/ui/button";

/**
 * ChallengeSearchModal — dropdown panel anchored below the "Challenge a
 * friend" CTA on /play.  Follows DESIGN.md §2/§3 patterns:
 *
 *  - Token-driven colors only (no hex/rgb/inline-oklch).
 *  - Input: rounded-full bg-muted border-border, focus:ring-foreground.
 *  - Avatar: initial-fallback tile matching AddFriendButton.
 *  - CTA: brand-filled pill.
 *  - Labels: font-mono text-mono-sm uppercase.
 *  - Empty states: font-display italic.
 *
 * The component listens for a custom "challenge-modal:open" DOM event
 * dispatched by the Astro inline script when the button is clicked.
 */

interface UserProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  status: "online" | "in_game" | "offline";
  rating?: number;
}

/* ── click-outside hook (mirrors AddFriendButton) ────────────────────── */

function useOnClickOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler(event);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

/* ── component ───────────────────────────────────────────────────────── */

export function ChallengeSearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTimeSeconds, setSelectedTimeSeconds] = useState(600);
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onClose = useCallback(() => setIsOpen(false), []);
  useOnClickOutside(containerRef, onClose);

  /* ── fetch current user id once ─────────────────────────────────── */
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) setCurrentUserId(data.id);
      })
      .catch(() => {});
  }, []);

  /* ── listen for the open event from the Astro button ────────────── */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.time) setSelectedTimeSeconds(Number(detail.time));
      setIsOpen((prev) => {
        if (!prev) {
          setSearchQuery("");
        }
        return true;
      });
    };
    window.addEventListener("challenge-modal:open", handler);
    return () => window.removeEventListener("challenge-modal:open", handler);
  }, []);

  /* ── focus input + fetch friends on open ─────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  /* ── escape closes ──────────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);



  /* ── data fetchers ──────────────────────────────────────────────── */
  const fetchFriends = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data: UserProfile[] = await res.json();
        setFriends(
          currentUserId ? data.filter((u) => u.id !== currentUserId) : data
        );
      }
    } catch (err) {
    }
  };

  /* ── challenge action ───────────────────────────────────────────── */
  const handleChallenge = (userId: number) => {
    setIsOpen(false);
    window.location.href = `/chat?user=${userId}&challenge=true&time=${selectedTimeSeconds}`;
  };

  if (!isOpen) return null;

  const query = searchQuery.trim().toLowerCase();
  const displayedUsers = query
    ? friends.filter((f) => f.username.toLowerCase().includes(query))
    : friends;

  return (
    <div
      ref={containerRef}
      className={cn(
        /* Card surface — matches §3.2 focused-card composition */
        "absolute left-0 right-0 mt-3 top-full z-50",
        "rounded-xl border border-border bg-surface text-surface-foreground shadow-lg",
        "p-4 flex flex-col gap-3",
        "animate-fade-in origin-top"
      )}
    >
      {/* ── search input ── matches AddFriendButton input exactly ─── */}
      <div className="relative">
        {/* magnifying-glass icon — inline SVG to avoid lucide dep */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 w-full rounded-full bg-muted border border-border pl-9 pr-8 py-1.5 font-sans text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── section label ─────────────────────────────────────────── */}
      <p className="font-mono text-mono-sm uppercase text-muted-foreground">
        {searchQuery.trim() ? "Results" : "Friends"}
      </p>

      {/* ── user list ─────────────────────────────────────────────── */}
      <ul className="flex flex-col gap-2 max-h-48 min-h-48 overflow-y-auto pr-1">
        {displayedUsers.length === 0 ? (
          <li className="flex-1 flex items-center justify-center font-display italic text-muted-foreground text-sm">
            {searchQuery.trim()
              ? "No friends match your search."
              : "No friends yet."}
          </li>
        ) : (
          displayedUsers.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              {/* avatar + info */}
              <div className="flex items-center gap-2.5 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="size-8 rounded-lg border border-border object-cover shrink-0"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-display italic text-sm text-foreground">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-sans text-sm font-semibold text-foreground">
                    {user.username}
                  </span>
                  <span className="font-mono text-mono-sm uppercase text-muted-foreground">
                    Elo {user.rating ?? 1000}
                  </span>
                </div>
              </div>

              {/* challenge CTA */}
              <button
                onClick={() => handleChallenge(user.id)}
                className={cn(
                  buttonVariants({ variant: "brand-filled" }),
                  "h-7 px-3 text-xs rounded-full font-mono uppercase transition-all duration-200 shrink-0 cursor-pointer"
                )}
              >
                Challenge
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
