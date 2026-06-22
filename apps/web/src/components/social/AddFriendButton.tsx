import React, { useState, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { buttonVariants } from "~/components/ui/button";

interface UserSearchResult {
  id: number;
  username: string;
  avatarUrl: string | null;
  status: "online" | "in_game" | "offline";
}

interface PendingRequest {
  friendshipId: number;
  id: number; // sender ID
  username: string;
  avatarUrl: string | null;
}

interface SentRequest {
  friendshipId: number;
  id: number; // recipient ID
  username: string;
  avatarUrl: string | null;
}

interface Friend {
  friendshipId: number;
  id: number;
  username: string;
  avatarUrl: string | null;
  status: "online" | "in_game" | "offline";
  rating: number;
}

interface AddFriendButtonProps {
  profileUserId: number;
  profileUsername: string;
  isSelf: boolean;
}

function useOnClickOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
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

export default function AddFriendButton({
  profileUserId,
  profileUsername,
  isSelf,
}: AddFriendButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "inbox">("send");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [sentRequestUserIds, setSentRequestUserIds] = useState<Record<number, number>>({});
  
  // Local state for "other profile" button label: "idle" | "sent" | "friends" | "received"
  const [friendshipState, setFriendshipState] = useState<"idle" | "sent" | "friends" | "received">("idle");
  const [activeFriendshipId, setActiveFriendshipId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useOnClickOutside(containerRef, () => setIsOpen(false));

  // Fetch pending requests & friends
  const fetchInbox = async () => {
    try {
      const res = await fetch("/api/friends/requests");
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data);
      }
    } catch (e) {
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriendsList(data);
      }
    } catch (e) {
    }
  };

  const fetchSentRequests = async () => {
    try {
      const res = await fetch("/api/friends/requests/sent");
      if (res.ok) {
        const data = await res.json();
        setSentRequests(data);
      }
    } catch (e) {
    }
  };

  // On mount: setup escape key listener, initial fetches, and real-time DOM sync event listeners
  useEffect(() => {
    fetchInbox();
    fetchFriends();
    fetchSentRequests();
    
    // Check escape key to close dropdown
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    const handleReceived = (e: Event) => {
      const customEvent = e as CustomEvent;
      const newNotif = customEvent.detail;
      if (newNotif && newNotif.type === "friend_request" && newNotif.content?.from) {
        const newRequest = {
          id: newNotif.content.from.id,
          username: newNotif.content.from.username,
          avatarUrl: newNotif.content.from.avatarUrl,
          friendshipId: newNotif.content.friendshipId,
        };
        setPendingRequests((prev) => {
          if (prev.some((r) => r.friendshipId === newRequest.friendshipId)) return prev;
          return [...prev, newRequest];
        });
      }
    };

    const handleResponded = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { friendshipId } = customEvent.detail || {};
      if (friendshipId) {
        setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
        fetchFriends();
      }
    };

    document.addEventListener("friend-request:received", handleReceived);
    document.addEventListener("friend-request:responded", handleResponded);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("friend-request:received", handleReceived);
      document.removeEventListener("friend-request:responded", handleResponded);
    };
  }, []);

  // Sync friendsList updates to the Astro layout DOM
  const prevFriendsStrRef = useRef("");
  useEffect(() => {
    const ids = friendsList.map((f) => `${f.id}:${f.status}`).join(",");
    if (prevFriendsStrRef.current !== ids) {
      prevFriendsStrRef.current = ids;
      document.dispatchEvent(new CustomEvent("friends-updated"));
    }
  }, [friendsList]);

  // Reconcile optimistic sent invites with backend data
  useEffect(() => {
    setSentRequestUserIds((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const idStr of Object.keys(next)) {
        const id = Number(idStr);
        const isFriend = friendsList.some((f) => f.id === id);
        const inSentRequests = sentRequests.some((s) => s.id === id);
        
        if (isFriend || inSentRequests || Date.now() - next[id] > 10000) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [friendsList, sentRequests]);

  // Update friendship state for other user profile page
  useEffect(() => {
    if (isSelf) return;

    const isFriend = friendsList.find((f) => f.id === profileUserId);
    if (isFriend) {
      setFriendshipState("friends");
      setActiveFriendshipId(isFriend.friendshipId);
      return;
    }

    const hasReceived = pendingRequests.find((r) => r.id === profileUserId);
    if (hasReceived) {
      setFriendshipState("received");
      setActiveFriendshipId(hasReceived.friendshipId);
      return;
    }

    const hasSent = sentRequests.find((s) => s.id === profileUserId);
    if (hasSent) {
      setFriendshipState("sent");
      setActiveFriendshipId(hasSent.friendshipId);
      return;
    }

    // Default to idle if not explicitly friends, received, or sent
    setFriendshipState("idle");
    setActiveFriendshipId(null);
  }, [friendsList, pendingRequests, sentRequests, isSelf, profileUserId]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    setLoadingSearch(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out ourself from search results
          setSearchResults(data.filter((u: UserSearchResult) => u.id !== profileUserId || !isSelf));
        }
      } catch (e) {
      } finally {
        setLoadingSearch(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, isSelf, profileUserId]);

  // Actions
  const handleSendInvite = async (targetId: number, username: string) => {
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetId }),
      });

      if (res.ok || res.status === 409) {
        // Invite sent successfully (or was already pending/exists)
        if (!isSelf) {
          setFriendshipState("sent");
        }
        // Update local sent tracking
        setSentRequestUserIds((prev) => ({ ...prev, [targetId]: Date.now() }));
        fetchSentRequests();
      } else {
        const errData = await res.json();
      }
    } catch (e) {
    }
  };

  const handleRespondRequest = async (friendshipId: number, accept: boolean) => {
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId, accept }),
      });

      if (res.ok) {
        // Remove from local requests inbox list
        setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
        fetchFriends(); // Refresh friends list
        
        if (!isSelf && friendshipId === activeFriendshipId) {
          setFriendshipState(accept ? "friends" : "idle");
        }
        // Dispatch custom event to notify Astro script to update friends list
        document.dispatchEvent(new CustomEvent("friends-updated"));

        // Sync with notifications dropdown
        document.dispatchEvent(
          new CustomEvent("friend-request:responded", {
            detail: { friendshipId, accept },
          })
        );
      }
    } catch (e) {
    }
  };

  const handleRemoveFriend = async (friendshipId: number) => {
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFriendsList((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
        setSentRequests((prev) => prev.filter((s) => s.friendshipId !== friendshipId));
        if (!isSelf) {
          setFriendshipState("idle");
        }
        // Dispatch custom event to notify Astro script to update friends list
        document.dispatchEvent(new CustomEvent("friends-updated"));
      }
    } catch (e) {
    }
  };

  const handleRemoveFriendByUserId = async (targetUserId: number) => {
    try {
      const res = await fetch(`/api/friends/user/${targetUserId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFriendsList((prev) => prev.filter((f) => f.id !== targetUserId));
        setSentRequestUserIds((prev) => {
          const next = { ...prev };
          delete next[targetUserId];
          return next;
        });
        setSentRequests((prev) => prev.filter((s) => s.id !== targetUserId));
        if (!isSelf && targetUserId === profileUserId) {
          setFriendshipState("idle");
        }
        // Dispatch custom event to notify Astro script to update friends list
        document.dispatchEvent(new CustomEvent("friends-updated"));
      }
    } catch (e) {
    }
  };

  const hasBadge = isSelf && pendingRequests.length > 0;

  // Renders for SELF profile: opens the interactive dropdown
  if (isSelf) {
    return (
      <div className="relative inline-block" ref={containerRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          title="Add friend / Manage requests"
          aria-label="Add friend / Manage requests"
          className={cn(
            buttonVariants({ variant: "brand-outline", size: "icon" }),
            "border-2 relative focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span className="sr-only">Add friend</span>

          {hasBadge && (
            <span
              className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-accent text-[9px] font-mono font-bold text-background leading-none ring-2 ring-surface shadow-md"
              aria-label={`${pendingRequests.length} pending requests`}
            >
              {pendingRequests.length}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute left-0 md:left-auto md:right-0 mt-3 top-full w-72 md:w-80 min-h-[200px] z-50 rounded-xl border border-border bg-surface text-surface-foreground shadow-lg p-4 flex flex-col gap-4 animate-fade-in origin-top-left md:origin-top-right">
            {/* Tabs */}
            <div className="flex border-b border-border mb-1" role="tablist">
              <button
                role="tab"
                aria-selected={activeTab === "send"}
                onClick={() => setActiveTab("send")}
                className={cn(
                  "flex-1 pb-2 font-mono text-mono-sm uppercase text-center transition-colors border-b-2 focus:outline-none",
                  activeTab === "send"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Send Invite
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "inbox"}
                onClick={() => setActiveTab("inbox")}
                className={cn(
                  "flex-1 pb-2 font-mono text-mono-sm uppercase text-center transition-colors border-b-2 relative focus-visible:outline-none cursor-pointer",
                  activeTab === "inbox"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Inbox
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "send" ? (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 w-full rounded-full bg-muted border border-border pl-4 pr-8 py-1.5 font-sans text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-foreground placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {loadingSearch && (
                  <p className="text-center font-mono text-mono-sm text-muted-foreground py-2">
                    Searching...
                  </p>
                )}

                {!loadingSearch && searchQuery.trim() && searchResults.length === 0 && (
                  <p className="text-center font-display italic text-muted-foreground py-4">
                    No users found.
                  </p>
                )}

                {searchResults.length > 0 && (
                  <ul className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                    {searchResults.map((user) => {
                      const friendObj = friendsList.find((f) => f.id === user.id);
                      const isFriend = !!friendObj;
                      const isSent = sentRequests.some((s) => s.id === user.id) || 
                                     (sentRequestUserIds[user.id] && Date.now() - sentRequestUserIds[user.id] < 10000);
                      const isIncoming = pendingRequests.some((r) => r.id === user.id);

                      return (
                        <li key={user.id} className="flex items-center justify-between gap-3 py-1">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt=""
                                className="size-8 rounded-lg border border-border object-cover"
                              />
                            ) : (
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-display italic text-sm text-foreground">
                                {user.username.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span className="truncate font-sans text-sm font-semibold text-foreground">
                              {user.username}
                            </span>
                          </div>

                          {isFriend ? (
                            <button
                              onClick={() => handleRemoveFriendByUserId(user.id)}
                              className={cn(
                                buttonVariants({ variant: "outline" }),
                                "h-7 px-3 text-xs rounded-full font-mono uppercase border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all duration-200"
                              )}
                            >
                              Remove
                            </button>
                          ) : isSent ? (
                            <button
                              disabled
                              className={cn(
                                buttonVariants({ variant: "outline" }),
                                "h-7 px-3 text-xs rounded-full font-mono uppercase opacity-60 cursor-not-allowed border-muted-foreground/30 text-muted-foreground transition-all duration-200"
                              )}
                            >
                              Invited
                            </button>
                          ) : isIncoming ? (
                            <button
                              onClick={() => {
                                const req = pendingRequests.find((r) => r.id === user.id);
                                if (req) handleRespondRequest(req.friendshipId, true);
                              }}
                              className={cn(
                                buttonVariants({ variant: "brand-filled" }),
                                "h-7 px-3 text-xs rounded-full font-mono uppercase transition-all duration-200"
                              )}
                            >
                              Accept
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSendInvite(user.id, user.username)}
                              className={cn(
                                buttonVariants({ variant: "brand-filled" }),
                                "h-7 px-3 text-xs rounded-full font-mono uppercase transition-all duration-200"
                              )}
                            >
                              Invite
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingRequests.length === 0 ? (
                  <p className="py-8 text-center font-display italic text-muted-foreground text-sm">
                    No pending invites.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {pendingRequests.map((req) => (
                      <li key={req.friendshipId} className="flex items-center justify-between gap-3 py-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {req.avatarUrl ? (
                            <img
                              src={req.avatarUrl}
                              alt=""
                              className="size-8 rounded-lg border border-border object-cover"
                            />
                          ) : (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-display italic text-sm text-foreground">
                              {req.username.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate font-sans text-sm font-semibold text-foreground">
                            {req.username}
                          </span>
                        </div>

                         <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRespondRequest(req.friendshipId, true)}
                            className={cn(
                              buttonVariants({ variant: "brand-filled" }),
                              "h-7 px-3 text-xs rounded-full font-mono uppercase transition-all duration-200"
                            )}
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRespondRequest(req.friendshipId, false)}
                            className={cn(
                              buttonVariants({ variant: "outline" }),
                              "h-7 px-3 text-xs rounded-full font-mono uppercase transition-all duration-200"
                            )}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Renders for OTHER user profile: acts as a direct action CTA
  return (
    <div className="inline-block">
      {friendshipState === "friends" && activeFriendshipId !== null ? (
        <button
          onClick={() => handleRemoveFriend(activeFriendshipId)}
          title="Remove Friend"
          aria-label="Remove Friend"
          className={cn(
            buttonVariants({ variant: "brand-outline", size: "icon" }),
            "border-2 text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          {/* Friends check icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-pawn-yellow"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <polyline points="16 11 18 13 22 9" />
          </svg>
          <span className="sr-only">Friends</span>
        </button>
      ) : friendshipState === "received" && activeFriendshipId !== null ? (
        <button
          onClick={() => handleRespondRequest(activeFriendshipId, true)}
          title="Accept Friend Request"
          aria-label="Accept Friend Request"
          className={cn(
            buttonVariants({ variant: "brand-filled", size: "icon" }),
            "focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          {/* Person check invite icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span className="sr-only">Accept Invite</span>
        </button>
      ) : friendshipState === "sent" ? (
        <button
          disabled
          title="Friend Request Sent"
          aria-label="Friend Request Sent"
          className={cn(
            buttonVariants({ variant: "brand-outline", size: "icon" }),
            "border-2 opacity-60 cursor-not-allowed"
          )}
        >
          {/* Request sent icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <polyline points="19 10 19 13 22 13" />
          </svg>
          <span className="sr-only">Request Sent</span>
        </button>
      ) : (
        <button
          onClick={() => handleSendInvite(profileUserId, profileUsername)}
          title="Add friend"
          aria-label="Add friend"
          className={cn(
            buttonVariants({ variant: "brand-outline", size: "icon" }),
            "border-2 focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span className="sr-only">Add friend</span>
        </button>
      )}
    </div>
  );
}
