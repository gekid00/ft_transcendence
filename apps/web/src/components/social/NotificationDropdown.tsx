import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Bell, BellOff, Check, X, MessageSquare, UserPlus, Trophy, Play, Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { buttonVariants } from "~/components/ui/button";

interface Notification {
  id: number;
  userId: number;
  type: "friend_request" | "friend_accepted" | "game_invite" | "game_finished" | "chat_message";
  content: {
    from?: {
      id: number;
      username: string;
      avatarUrl: string | null;
    };
    friendshipId?: number;
    messageId?: number;
    preview?: string;
    gameId?: number;
    lobbyId?: number;
  };
  read: boolean;
  createdAt: string;
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

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [friendRequestStatuses, setFriendRequestStatuses] = useState<Record<number, "accepted" | "declined">>({});

  const containerRef = useRef<HTMLDivElement | null>(null);
  useOnClickOutside(containerRef, () => setIsOpen(false));

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (e) {
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    fetchNotifications();

    const isGlobal = typeof window !== "undefined" && !!(window as any).globalSocket;
    const socket = isGlobal
      ? (window as any).globalSocket
      : io({ transports: ["websocket"] });
    if (typeof window !== "undefined") {
      (window as any).notifSocket = socket;
    }

    const handleNewNotification = (newNotif: Notification) => {
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((prev) => prev + 1);

      if (newNotif.type === "friend_request") {
        document.dispatchEvent(
          new CustomEvent("friend-request:received", { detail: newNotif })
        );
      }
    };

    const handleGameStatusUpdate = ({ gameId, status }: { gameId: number; status: string }) => {
      setNotifications((prev) =>
        prev.map((n) => {
          if (n.type === "game_invite" && n.content.gameId === gameId) {
            return {
              ...n,
              content: {
                ...n.content,
                gameStatus: status,
              },
            };
          }
          return n;
        })
      );
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:game-status-update", handleGameStatusUpdate);

    const handleScroll = () => {
      if (isOpenRef.current) {
        const slot = document.querySelector("body > div.flex.flex-1");
        const y = (slot && slot.scrollTop) || window.scrollY || 0;
        if (y > 32) {
          setIsOpen(false);
        }
      }
    };

    const handleResponded = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { friendshipId, accept } = customEvent.detail || {};
      if (friendshipId) {
        setNotifications((prevNotifications) => {
          const matchingNotif = prevNotifications.find(
            (n) => n.type === "friend_request" && n.content.friendshipId === friendshipId
          );
          if (matchingNotif) {
            const notifId = matchingNotif.id;
            setFriendRequestStatuses((prevStatuses) => ({
              ...prevStatuses,
              [notifId]: accept ? "accepted" : "declined",
            }));
            
            // Mark read in state
            if (!matchingNotif.read) {
              setUnreadCount((prevCount) => Math.max(0, prevCount - 1));
            }
            return prevNotifications.map((n) =>
              n.id === notifId ? { ...n, read: true } : n
            );
          }
          return prevNotifications;
        });
      }
    };

    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("friend-request:responded", handleResponded);

    return () => {
      if (isGlobal) {
        socket.off("notification:new", handleNewNotification);
        socket.off("notification:game-status-update", handleGameStatusUpdate);
      } else {
        socket.disconnect();
      }
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("friend-request:responded", handleResponded);
    };
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (e) {
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
      });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (e) {
    }
  };

  const handleFriendResponse = async (notifId: number, friendshipId: number, accept: boolean) => {
    setActioningId(notifId);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId, accept }),
      });
      if (res.ok) {
        await fetch(`/api/notifications/${notifId}/read`, { method: "PATCH" });
        setFriendRequestStatuses((prev) => ({
          ...prev,
          [notifId]: accept ? "accepted" : "declined",
        }));
        setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
        document.dispatchEvent(new CustomEvent("friends-updated"));
        
        document.dispatchEvent(
          new CustomEvent("friend-request:responded", {
            detail: { friendshipId, accept },
          })
        );
      } else {
        alert("Failed to respond to friend request. It may have already been handled.");
      }
    } catch (e) {
    } finally {
      setActioningId(null);
    }
  };

  const handleChatMessageClick = async (notifId: number, senderId: number) => {
    try {
      await fetch(`/api/notifications/${notifId}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
    }
    setIsOpen(false);
    window.location.href = `/chat?user=${senderId}`;
  };

  const handleJoinGame = async (notifId: number, gameId: number) => {
    try {
      await fetch(`/api/notifications/${notifId}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
    }
    setIsOpen(false);
    window.location.href = `/play/m/${gameId}`;
  };

  const handleMarkAsRead = async (notifId: number) => {
    try {
      await fetch(`/api/notifications/${notifId}/read`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
    }
  };

  function formatTimeAgo(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const renderAvatar = (from: any, type: string) => {
    const initial = from?.username ? from.username[0].toUpperCase() : "?";
    if (from?.avatarUrl) {
      return (
        <img
          src={from.avatarUrl}
          alt={from.username || "User"}
          className="size-9 shrink-0 rounded-md object-cover border border-border"
        />
      );
    }

    let bgClass = "bg-muted text-foreground";
    let iconEl = null;

    if (type === "friend_request" || type === "friend_accepted") {
      bgClass = "bg-brand/10 text-brand";
      iconEl = <UserPlus className="size-4" />;
    } else if (type === "chat_message") {
      bgClass = "bg-primary/10 text-primary";
      iconEl = <MessageSquare className="size-4" />;
    } else if (type === "game_invite") {
      bgClass = "bg-emerald-500/10 text-emerald-500";
      iconEl = <Play className="size-4 fill-current" />;
    } else if (type === "game_finished") {
      bgClass = "bg-yellow-500/10 text-yellow-500";
      iconEl = <Trophy className="size-4" />;
    }

    if (from?.username) {
      return (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground font-display italic text-sm font-semibold">
          {initial}
        </div>
      );
    }

    return (
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md border border-border/40", bgClass)}>
        {iconEl || <Bell className="size-4" />}
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        title="Notifications"
        className={cn(
          "relative grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-all duration-150 ease-out hover:bg-foreground hover:text-background active:scale-[0.96]",
          isOpen && "bg-foreground text-background"
        )}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-accent text-[9px] font-mono font-bold text-background leading-none ring-2 ring-background shadow-md">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute -right-2 top-[76px] sm:right-0 sm:top-[60px] w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-5 duration-200">
          <div className="flex items-center justify-between border-b border-border px-4 py-5 bg-muted/40">
            <button
              onClick={handleClearAll}
              className="text-sm font-semibold text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none cursor-pointer"
            >
              Clear
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-brand hover:underline font-medium focus-visible:outline-none cursor-pointer"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto divide-y divide-border/60">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <BellOff className="size-8 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-medium text-foreground">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-0.5">No new notifications here.</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !notif.read;
                const status = friendRequestStatuses[notif.id] || notif.content.friendshipStatus;

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (notif.type === "chat_message" && notif.content.from?.id) {
                        handleChatMessageClick(notif.id, notif.content.from.id);
                      } else if (notif.type !== "friend_request" && notif.type !== "game_invite") {
                        handleMarkAsRead(notif.id);
                      }
                    }}
                    className={cn(
                      "flex gap-3 px-4 pt-4 pb-2.5 text-left transition-colors duration-150",
                      isUnread ? "bg-muted/10" : "opacity-75 hover:bg-muted/5",
                      notif.type === "chat_message" && "cursor-pointer hover:bg-muted/10"
                    )}
                  >
                    {renderAvatar(notif.content.from, notif.type)}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(notif.createdAt)}
                        </span>
                        {isUnread && (
                          <span className="size-1.5 rounded-full bg-brand shrink-0" />
                        )}
                      </div>

                      <div className="text-sm text-foreground mt-0.5">
                        {notif.type === "friend_request" && (
                          <div>
                            <span className="font-semibold">{notif.content.from?.username || "Someone"}</span>{" "}
                            sent you a friend request.
                          </div>
                        )}

                        {notif.type === "friend_accepted" && (
                          <div>
                            <span className="font-semibold">{notif.content.from?.username || "Someone"}</span>{" "}
                            accepted your friend request!
                          </div>
                        )}

                        {notif.type === "chat_message" && (
                          <div>
                            <span className="font-semibold">{notif.content.from?.username || "Someone"}</span>
                            <p className="text-xs text-muted-foreground italic truncate mt-0.5">
                              {notif.content.preview?.startsWith("__CHALLENGE__:") ? (
                                <span className="text-accent font-medium not-italic">
                                  Game challenge
                                </span>
                              ) : (
                                `"${notif.content.preview || "New message"}"`
                              )}
                            </p>
                          </div>
                        )}

                        {notif.type === "game_invite" && (
                          <div>
                            Game started with <span className="font-semibold">{notif.content.from?.username || "Someone"}</span>!
                          </div>
                        )}

                        {notif.type === "game_finished" && (
                          <div>
                            A game has finished.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action column on the far right, aligned with the middle of the entry */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5 self-center">
                      {/* Friend request actions/status */}
                      {notif.type === "friend_request" && (
                        <>
                          {status === "accepted" ? (
                            <span className="text-xs text-green-500 font-medium flex items-center gap-1">
                              <Check className="size-3" /> Accepted
                            </span>
                          ) : status === "declined" ? (
                            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                              <X className="size-3" /> Declined
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (notif.content.friendshipId) {
                                    handleFriendResponse(notif.id, notif.content.friendshipId, true);
                                  }
                                }}
                                disabled={actioningId === notif.id}
                                className={cn(
                                  buttonVariants({ variant: "default", size: "xs" }),
                                  "font-semibold cursor-pointer"
                                )}
                              >
                                Accept
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (notif.content.friendshipId) {
                                    handleFriendResponse(notif.id, notif.content.friendshipId, false);
                                  }
                                }}
                                disabled={actioningId === notif.id}
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "xs" }),
                                  "font-semibold cursor-pointer"
                                )}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {/* Game invite action/status */}
                      {notif.type === "game_invite" && (
                        <>
                          {notif.content.gameStatus === "finished" || notif.content.gameStatus === "abandoned" ? (
                            <span className="text-xs text-muted-foreground font-medium">
                              Finished
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  if (notif.content.gameId) {
                                    handleJoinGame(notif.id, notif.content.gameId);
                                  }
                                }}
                              className={cn(
                                buttonVariants({ variant: "brand-filled", size: "xs" }),
                                "font-semibold cursor-pointer"
                              )}
                            >
                              <Play className="size-3 fill-current" /> Join
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
