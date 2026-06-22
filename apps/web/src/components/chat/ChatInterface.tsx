import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  MessageSquare,
  Send,
  Search,
  ChevronLeft,
  Gamepad2,
  Check,
  CheckCheck,
  X,
  Smile,
  Plus
} from "lucide-react";

interface ChatInterfaceProps {
  currentUserId: number;
  currentUsername: string;
  embeddedOpponentId?: number;
}

interface UserProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  status: "online" | "in_game" | "offline";
  bio?: string;
  rating?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  gamesLost?: number;
  gamesDrawn?: number;
  rank?: number;
  title?: string;
}

interface Conversation {
  id: number;
  username: string;
  avatarUrl: string | null;
  status: "online" | "in_game" | "offline";
  lastMessage?: string;
  lastMessageAt?: string | Date;
}

interface ChatMessage {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string | Date;
  // Local UI extensions
  reactions?: string[];
  readStatus?: "sent" | "read";
}

export default function ChatInterface({ currentUserId, currentUsername, embeddedOpponentId }: ChatInterfaceProps) {
  const isInGame = typeof window !== "undefined" && window.location.pathname.includes("/play/m/");
  const isEmbedded = !!embeddedOpponentId || isInGame;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContact, setSelectedContact] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (embeddedOpponentId) {
      startChatWithUserId(embeddedOpponentId);
    }
  }, [embeddedOpponentId]);
  const [inputText, setInputText] = useState("");
  const [typingContact, setTypingContact] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSearchQuery, setNewChatSearchQuery] = useState("");
  const [viewState, setViewState] = useState<"list" | "chat">("list");
  
  // Local reaction states
  const [messageReactions, setMessageReactions] = useState<Record<number, string[]>>({});
  const [activeReactionPicker, setActiveReactionPicker] = useState<number | null>(null);

  // Challenge and Lobbies state
  const [activeLobbies, setActiveLobbies] = useState<Record<number, any>>({});
  const fetchedLobbiesRef = useRef<Set<number>>(new Set());

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEmitTypingTimeRef = useRef<number>(0);
  const autoChallengeSentRef = useRef(false);
  const startingGameRef = useRef(false);

  const selectedContactRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  // 1. Fetch Conversations and Friends on mount
  useEffect(() => {
    fetchConversations();
    fetchFriends();

    const handleFriendsUpdated = () => {
      fetchFriends();
      fetchConversations();
    };

    document.addEventListener("friends-updated", handleFriendsUpdated);

    const isGlobal = typeof window !== "undefined" && !!(window as any).globalSocket;
    const socket = isGlobal
      ? (window as any).globalSocket
      : io({ transports: ["websocket"] });
    socketRef.current = socket;

    const runAutoChallenge = () => {
      const params = new URLSearchParams(window.location.search);
      const userIdParam = params.get("user");
      const triggerChallenge = params.get("challenge") === "true";
      const timeParam = params.get("time");
      const timeLimit = timeParam ? parseInt(timeParam, 10) : 600;

      if (userIdParam && triggerChallenge) {
        const targetUserId = parseInt(userIdParam, 10);
        if (!isNaN(targetUserId) && !autoChallengeSentRef.current) {
          autoChallengeSentRef.current = true;
          setTimeout(async () => {
            try {
              // Create a private lobby
              const res = await fetch("/api/lobbies", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  isPublic: false,
                  timePerPlayerSeconds: timeLimit,
                }),
              });

              if (!res.ok) return;
              const lobby = await res.json();

              // Listen on lobby room for real-time join updates
              socket.emit("lobby:join", { lobbyId: lobby.id });

              // Send special challenge message syntax
              const challengeMsg = `__CHALLENGE__:${lobby.id}:${lobby.code}:${timeLimit}`;
              socket.emit("chat:send", {
                receiverId: targetUserId,
                content: challengeMsg,
              });

              // Remove query params from URL so refreshing won't trigger another challenge
              const newUrl = window.location.pathname + `?user=${targetUserId}`;
              window.history.replaceState({ path: newUrl }, "", newUrl);
            } catch (err) {
            }
          }, 500);
        }
      }
    };

    if (socket.connected) {
      runAutoChallenge();
    } else {
      socket.on("connect", runAutoChallenge);
    }

    const handleChatMessage = (msg: ChatMessage) => {
      // Clear typing indicator immediately if we get a message from the sender
      if (selectedContactRef.current && msg.senderId === selectedContactRef.current.id) {
        setTypingContact(null);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }

      // Add message if it belongs to current active thread
      setMessages((prev) => {
        if (
          (msg.senderId === currentUserId && msg.receiverId === selectedContact?.id) ||
          (msg.senderId === selectedContact?.id && msg.receiverId === currentUserId)
        ) {
          // Check if already in list to prevent double appends (due to echo back)
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, readStatus: msg.senderId === currentUserId ? "sent" : "read" }];
        }
        return prev;
      });

      // Update conversations list lastMessage preview
      setConversations((prev) => {
        const contactId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
        const exists = prev.some((c) => c.id === contactId);

        if (exists) {
          return prev.map((c) => {
            if (c.id === contactId) {
              return {
                ...c,
                lastMessage: msg.content,
                lastMessageAt: msg.createdAt,
              };
            }
            return c;
          }).sort((a, b) => {
            const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return dateB - dateA;
          });
        } else {
          // If we received a message from someone not in list, trigger full refresh
          fetchConversations();
          return prev;
        }
      });
    };

    const handleChatTyping = (data: { from: number }) => {
      if (selectedContact && data.from === selectedContact.id) {
        setTypingContact(data.from);
        
        // Auto clear after 3 seconds
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setTypingContact(null);
        }, 3000);
      }
    };

    const handleChatReaction = (data: { messageId: number; emoji: string; senderId: number }) => {
      setMessageReactions((prev) => {
        const current = prev[data.messageId] || [];
        if (current.includes(data.emoji)) {
          return {
            ...prev,
            [data.messageId]: current.filter((e) => e !== data.emoji),
          };
        }
        return {
          ...prev,
          [data.messageId]: [...current, data.emoji],
        };
      });
    };

    const handleGameStart = (data: { gameId: number }) => {
      // Le créateur navigue lui-même après que sa requête /start ait répondu
      // (cf. startLobbyGame), donc on ignore l'event ici pour ne pas couper
      // la requête en plein vol → évite le NetworkError dans la console.
      if (startingGameRef.current) return;
      window.location.href = `/play/m/${data.gameId}`;
    };

    const handleLobbyUpdate = ({ lobby }: { lobby: any }) => {
      setActiveLobbies((prev) => ({
        ...prev,
        [lobby.id]: lobby,
      }));

      // Creator auto-starts game when player 2 joins
      if (
        lobby.creatorId === currentUserId &&
        lobby.player2Id !== null &&
        lobby.status === "waiting"
      ) {
        startLobbyGame(lobby.id);
      }
    };

    socket.on("chat:message", handleChatMessage);
    socket.on("chat:typing", handleChatTyping);
    socket.on("chat:reaction", handleChatReaction);
    socket.on("game:start", handleGameStart);
    socket.on("lobby:update", handleLobbyUpdate);

    return () => {
      if (isGlobal) {
        socket.off("connect", runAutoChallenge);
        socket.off("chat:message", handleChatMessage);
        socket.off("chat:typing", handleChatTyping);
        socket.off("chat:reaction", handleChatReaction);
        socket.off("game:start", handleGameStart);
        socket.off("lobby:update", handleLobbyUpdate);
      } else {
        socket.disconnect();
      }
      document.removeEventListener("friends-updated", handleFriendsUpdated);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [selectedContact, currentUserId]);

  // Handle URL query parameter ?user=ID to auto-select chat
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userIdParam = params.get("user");
    if (userIdParam) {
      const targetUserId = parseInt(userIdParam, 10);
      if (!isNaN(targetUserId)) {
        startChatWithUserId(targetUserId);
      }
    }
  }, []);

  // Scroll to bottom when message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingContact]);

  // Clear fetched lobbies ref when selecting a new contact
  useEffect(() => {
    fetchedLobbiesRef.current.clear();
  }, [selectedContact]);

  // Clear new chat search query when modal closes
  useEffect(() => {
    if (!showNewChatModal) {
      setNewChatSearchQuery("");
    }
  }, [showNewChatModal]);

  // Load lobby details for challenge messages
  useEffect(() => {
    if (!messages || !socketRef.current) return;
    const challengeLobbyIds = messages
      .map((m) => parseChallenge(m.content))
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => c.lobbyId);

    // Remove duplicates
    const uniqueLobbyIds = Array.from(new Set(challengeLobbyIds));

    uniqueLobbyIds.forEach(async (lobbyId) => {
      if (fetchedLobbiesRef.current.has(lobbyId)) return;
      fetchedLobbiesRef.current.add(lobbyId);

      // Join socket room to receive live updates (join, leave, start, close, etc.)
      socketRef.current?.emit("lobby:join", { lobbyId });

      try {
        const res = await fetch(`/api/lobbies/${lobbyId}`);
        if (res.ok) {
          const lobbyData = await res.json();
          setActiveLobbies((prev) => ({
            ...prev,
            [lobbyId]: lobbyData,
          }));
        }
      } catch (err) {
        // Remove from set so we can retry later if it failed
        fetchedLobbiesRef.current.delete(lobbyId);
      }
    });
  }, [messages, socketRef.current]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);

        // Update selected contact status if they are in conversations list
        const currentSelected = selectedContactRef.current;
        if (currentSelected) {
          const match = data.find((c) => c.id === currentSelected.id);
          if (match) {
            setSelectedContact((prev) => prev ? { ...prev, status: match.status } : null);
          }
        }
      }
    } catch (err) {
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriends(data);

        // Update selected contact status if they are in friends list
        const currentSelected = selectedContactRef.current;
        if (currentSelected) {
          const match = data.find((f) => f.id === currentSelected.id);
          if (match) {
            setSelectedContact((prev) => prev ? { ...prev, status: match.status } : null);
          }
        }
      }
    } catch (err) {
    }
  };

  const startChatWithUserId = async (userId: number) => {
    try {
      // 1. Fetch user public profile details
      const userRes = await fetch(`/api/users/${userId}`);
      if (!userRes.ok) return;
      const userProfile: UserProfile = await userRes.json();

      setSelectedContact(userProfile);
      setViewState("chat");
      setTypingContact(null);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      // 2. Fetch thread history
      const historyRes = await fetch(`/api/chat/${userId}`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        // The API returns messages ordered from newest to oldest. We want chronologically oldest to newest.
        setMessages(historyData.reverse().map(m => ({ ...m, readStatus: "read" })));
      } else {
        setSelectedContact(null);
        setViewState("list");
        const url = new URL(window.location.href);
        url.searchParams.delete("user");
        url.searchParams.delete("challenge");
        url.searchParams.delete("time");
        window.history.replaceState({}, "", url.pathname + url.search);
        return;
      }

      // 3. Make sure they are in the conversations list visually
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === userId);
        if (!exists) {
          return [
            {
              id: userProfile.id,
              username: userProfile.username,
              avatarUrl: userProfile.avatarUrl,
              status: userProfile.status,
            },
            ...prev,
          ];
        }
        return prev;
      });
    } catch (err) {
    }
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || !selectedContact || !socketRef.current) return;

    socketRef.current.emit("chat:send", {
      receiverId: selectedContact.id,
      content: inputText.trim(),
    });

    setInputText("");
    setTypingContact(null);
    lastEmitTypingTimeRef.current = 0;
  };

  const handleInputChange = (val: string) => {
    setInputText(val);

    if (!val.trim()) return;

    if (socketRef.current && selectedContact) {
      const now = Date.now();
      if (now - lastEmitTypingTimeRef.current > 2000) {
        lastEmitTypingTimeRef.current = now;
        socketRef.current.emit("chat:typing", {
          receiverId: selectedContact.id,
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  // Challenge matchmaking invite setup
  const handleSendChallenge = async () => {
    if (!selectedContact || !socketRef.current) return;

    try {
      // Create a private lobby
      const res = await fetch("/api/lobbies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublic: false,
          timePerPlayerSeconds: 600, // default 10 min
        }),
      });

      if (!res.ok) return;
      const lobby = await res.json();

      // Listen on lobby room for real-time join updates
      socketRef.current.emit("lobby:join", { lobbyId: lobby.id });

      // Send special challenge message syntax
      const challengeMsg = `__CHALLENGE__:${lobby.id}:${lobby.code}:600`;
      socketRef.current.emit("chat:send", {
        receiverId: selectedContact.id,
        content: challengeMsg,
      });
    } catch (err) {
    }
  };

  const handleAcceptChallenge = async (lobbyId: number, code: string) => {
    if (startingGameRef.current) return;
    startingGameRef.current = true;
    try {
      // 1. Join lobby
      const joinRes = await fetch(`/api/lobbies/${lobbyId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      if (!joinRes.ok) {
        startingGameRef.current = false;
        alert("Lobby is no longer available.");
        return;
      }

      const data = await joinRes.json();
      if (data?.gameId) {
        window.location.href = `/play/m/${data.gameId}`;
        return;
      }

      // 2. Connect to the lobby's socket room
      if (socketRef.current) {
        socketRef.current.emit("lobby:join", { lobbyId });
      }
    } catch (err) {
    }
  };

  const handleDeclineChallenge = async (lobbyId: number) => {
    try {
      await fetch(`/api/lobbies/${lobbyId}/decline`, {
        method: "POST",
      });
    } catch (err) {
    }
  };

  const startLobbyGame = async (lobbyId: number) => {
    if (startingGameRef.current) return;
    startingGameRef.current = true;
    try {
      const res = await fetch(`/api/lobbies/${lobbyId}/start`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.gameId) {
          window.location.href = `/play/m/${data.gameId}`;
        }
      }
    } catch (err) {
      startingGameRef.current = false;
    }
  };

  // Block/Unblock relationship handler
  const handleBlockUser = async () => {
    if (!selectedContact) return;
    try {
      const res = await fetch("/api/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: selectedContact.id }),
      });
      if (res.ok) {
        alert(`${selectedContact.username} has been blocked.`);
        setSelectedContact(null);
        fetchConversations();
      }
    } catch (err) {
    }
  };

  // Add emoji reaction
  const handleAddReaction = (messageId: number, emoji: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.senderId === currentUserId) return; // Prevent reacting to own messages

    setMessageReactions((prev) => {
      const current = prev[messageId] || [];
      if (current.includes(emoji)) {
        return {
          ...prev,
          [messageId]: current.filter((e) => e !== emoji),
        };
      }
      return {
        ...prev,
        [messageId]: [...current, emoji],
      };
    });

    if (socketRef.current && selectedContact) {
      socketRef.current.emit("chat:reaction", {
        messageId,
        emoji,
        receiverId: selectedContact.id,
      });
    }

    setActiveReactionPicker(null);
  };

  // Filter conversations based on sidebar query
  const filteredConversations = conversations.filter((c) =>
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to check if a message represents a Connect-4 challenge
  const parseChallenge = (content: string) => {
    if (!content.startsWith("__CHALLENGE__:")) return null;
    const parts = content.split(":");
    return {
      lobbyId: parseInt(parts[1], 10),
      code: parts[2],
      time: parseInt(parts[3], 10),
    };
  };

  // Formatting date/timestamps
  const formatTime = (dateStr: string | Date) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatLobbyDuration = (seconds: number) => {
    return `${Math.round(seconds / 60)} min`;
  };

  return (
    <div className={cn(
      "flex w-full h-full min-h-0",
      isEmbedded
        ? "bg-transparent border-0 shadow-none overflow-visible"
        : "border border-border bg-surface text-surface-foreground rounded-xl shadow-sm overflow-hidden md:bg-transparent md:border-0 md:shadow-none md:rounded-none md:overflow-visible md:gap-6"
    )}>
      {/* ────────────────────────────────────────────────────────
          1. LEFT COLUMN: CONVERSATION LIST
          ──────────────────────────────────────────────────────── */}
      {!isEmbedded && (
        <aside
          className={`w-full md:w-80 flex flex-col border-r-0 md:border border-border bg-surface md:rounded-xl md:shadow-sm md:overflow-hidden transition-all ${
            viewState === "chat" ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display italic text-2xl tracking-tight text-foreground">
              Messages
            </h2>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-1.5 rounded-lg border border-border hover:border-foreground/50 hover:bg-muted text-foreground transition-all cursor-pointer"
              title="Start chat with friend"
            >
              <Plus className="size-4" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-border bg-surface relative">
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-muted border border-border focus:border-foreground/50 text-sm text-foreground focus:outline-none transition-all placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground"
            />
            <Search className="size-4 text-muted-foreground absolute left-6 top-5" />
          </div>

          {/* List items */}
          <ul className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm font-sans">
                No conversations found. Click the '+' button to chat with a friend.
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = selectedContact?.id === c.id;
                let statusColor = "bg-muted-foreground";
                if (c.status === "online") statusColor = "bg-pawn-yellow shadow-[0_0_8px_var(--color-pawn-yellow)]";
                else if (c.status === "in_game") statusColor = "bg-accent shadow-[0_0_8px_var(--color-accent)]";

                // Detect challenge preview text
                const isChallenge = c.lastMessage?.startsWith("__CHALLENGE__:");
                const previewText = isChallenge ? "Game Challenge Invitation" : c.lastMessage;

                return (
                  <li
                    key={c.id}
                    onClick={() => startChatWithUserId(c.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-muted border-l-2 border-accent"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="relative shrink-0">
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt=""
                          className="size-11 rounded-xl object-cover border border-border"
                        />
                      ) : (
                        <div className="size-11 rounded-xl bg-muted flex items-center justify-center font-display italic text-lg text-foreground border border-border">
                          {c.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface ${statusColor}`}
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground text-sm truncate">
                          {c.username}
                        </span>
                        {c.lastMessageAt && (
                          <span className="text-mono-sm text-muted-foreground whitespace-nowrap">
                            {formatTime(c.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      {previewText && (
                        <p className={`text-xs truncate ${isChallenge ? "text-accent italic font-medium" : "text-muted-foreground"}`}>
                          {previewText}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>
      )}

      {/* ────────────────────────────────────────────────────────
          2. ACTIVE CHAT THREAD (CENTER COLUMN)
          ──────────────────────────────────────────────────────── */}
      <section className={cn(
        "flex-1 flex flex-col min-h-0",
        isEmbedded
          ? "border border-border bg-surface rounded-xl shadow-sm overflow-hidden"
          : "bg-background md:bg-surface md:border md:border-border md:rounded-xl md:shadow-sm md:overflow-hidden",
        viewState === "list" ? "hidden md:flex" : "flex"
      )}>
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
              <div className="flex items-center gap-3 min-w-0">
                {!isEmbedded && (
                  <button
                    onClick={() => setViewState("list")}
                    className="md:hidden p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                )}

                <a
                  href={`/profile/${selectedContact.username}`}
                  className="flex items-center gap-3 min-w-0 hover:opacity-85 transition-opacity cursor-pointer group"
                >
                  <div className="relative shrink-0">
                    {selectedContact.avatarUrl ? (
                      <img
                        src={selectedContact.avatarUrl}
                        alt=""
                        className="size-10 rounded-xl object-cover border border-border"
                      />
                    ) : (
                      <div className="size-10 rounded-xl bg-muted flex items-center justify-center font-display italic text-md text-foreground border border-border">
                        {selectedContact.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface ${
                        selectedContact.status === "online"
                          ? "bg-pawn-yellow"
                          : selectedContact.status === "in_game"
                          ? "bg-accent"
                          : "bg-muted-foreground"
                      }`}
                    />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-foreground text-sm truncate group-hover:text-accent transition-colors">
                      {selectedContact.username}
                    </span>
                    <span className="text-mono-sm uppercase text-muted-foreground">
                      {selectedContact.status === "online"
                        ? "Online"
                        : selectedContact.status === "in_game"
                        ? "In game"
                        : "Offline"}
                    </span>
                  </div>
                </a>
              </div>

              {/* Header Actions */}
              {!isEmbedded && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendChallenge}
                    disabled={selectedContact.status === "offline"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-mono-sm uppercase bg-surface hover:bg-accent text-foreground hover:text-accent-foreground border border-border hover:border-accent disabled:opacity-50 disabled:pointer-events-none transition-colors active:scale-[0.98] cursor-pointer"
                    title="Challenge to Connect-4"
                  >
                    <Gamepad2 className="size-3.5" />
                    Challenge
                  </button>
                </div>
              )}
            </div>

            {/* Message History */}
            <div className="flex-1 overflow-y-auto hover-scrollbar p-4 space-y-4">
              {(() => {
                const displayedMessages = isEmbedded
                  ? messages.filter((m) => !m.content.startsWith("__CHALLENGE__:"))
                  : messages;

                if (displayedMessages.length === 0) {
                  return (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                      <MessageSquare className="size-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm font-sans">No messages yet. Send a friendly Hello!</p>
                    </div>
                  );
                }

                return displayedMessages.map((m) => {
                  const isMe = m.senderId === currentUserId;
                  const challenge = parseChallenge(m.content);
                  const reactions = messageReactions[m.id] || [];

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"} group relative`}
                    >
                      {/* Message Bubble */}
                      <div className="flex flex-col max-w-[85%]">
                        {challenge ? (
                          /* CHALLENGE WIDGET CARD */
                          (() => {
                            const lobbyInfo = activeLobbies[challenge.lobbyId];
                            const isTimeExpired = Date.now() - new Date(m.createdAt).getTime() > 10 * 60 * 1000;
                            const status = lobbyInfo?.status;

                            let contentNode;
                            if (status === "in_progress") {
                              contentNode = (
                                <button
                                  onClick={async () => {
                                    if (lobbyInfo?.gameId) {
                                      window.location.href = `/play/m/${lobbyInfo.gameId}`;
                                    } else {
                                      try {
                                        const res = await fetch("/api/games/active");
                                        if (res.ok) {
                                          const activeGames = await res.json();
                                          const myGame = activeGames.find(
                                            (g: any) => g.player1Id === currentUserId || g.player2Id === currentUserId
                                          );
                                          if (myGame) {
                                            window.location.href = `/play/m/${myGame.id}`;
                                            return;
                                          }
                                        }
                                      } catch (err) {}
                                      window.location.href = "/play";
                                    }
                                  }}
                                  className={cn(
                                    buttonVariants({ variant: "brand-filled", size: "sm" }),
                                    "w-full justify-center rounded-lg text-xs py-1 cursor-pointer"
                                  )}
                                >
                                  Join Game
                                </button>
                              );
                            } else if (status === "closed" || isTimeExpired) {
                              contentNode = (
                                <div className={`text-[11px] font-sans font-medium text-center flex items-center justify-center gap-1.5 py-1.5 rounded-lg opacity-75 w-full ${
                                  isMe
                                    ? "text-accent-foreground/70 bg-accent-foreground/10 border border-accent-foreground/15"
                                    : "text-muted-foreground bg-muted/20 border border-border/20"
                                }`}>
                                  <X className="size-3 shrink-0" />
                                  <span className="truncate">Expired / Declined</span>
                                </div>
                              );
                            } else {
                              // status === "waiting" or loading
                              if (isMe) {
                                contentNode = (
                                  <div className="flex flex-col gap-1.5 w-full">
                                    <div className="text-[11px] text-accent-foreground/70 text-center italic py-0.5 truncate">
                                      Waiting for friend...
                                    </div>
                                    <button
                                      onClick={() => handleDeclineChallenge(challenge.lobbyId)}
                                      className={cn(
                                        buttonVariants({ variant: "outline", size: "sm" }),
                                        "w-full justify-center rounded-lg text-xs py-1 cursor-pointer bg-transparent border-accent-foreground/30 text-accent-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                                      )}
                                    >
                                      Cancel Challenge
                                    </button>
                                  </div>
                                );
                              } else {
                                contentNode = (
                                  <div className="flex flex-wrap gap-1.5 w-full">
                                    <button
                                      onClick={() => handleAcceptChallenge(challenge.lobbyId, challenge.code)}
                                      className={cn(
                                        buttonVariants({ variant: "brand-filled", size: "sm" }),
                                        "flex-1 min-w-[70px] justify-center rounded-lg text-xs py-1 cursor-pointer"
                                      )}
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleDeclineChallenge(challenge.lobbyId)}
                                      className={cn(
                                        buttonVariants({ variant: "outline", size: "sm" }),
                                        "flex-1 min-w-[70px] justify-center rounded-lg text-xs py-1 cursor-pointer bg-surface hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                                      )}
                                    >
                                      Decline
                                    </button>
                                  </div>
                                );
                              }
                            }

                            return (
                              <div className={`rounded-2xl p-3 flex flex-col gap-2.5 min-w-0 ${
                                isMe
                                  ? "bg-accent text-accent-foreground border border-accent/10 rounded-tr-sm"
                                  : "bg-muted text-foreground border border-border rounded-tl-sm"
                              }`}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Gamepad2 className={`size-4 shrink-0 animate-pulse ${isMe ? "text-accent-foreground" : "text-accent"}`} />
                                  <span className={`font-sans font-semibold text-xs truncate ${isMe ? "text-accent-foreground" : "text-foreground"}`}>
                                    Connect 4
                                  </span>
                                  <span className={`font-mono text-[9px] uppercase ml-auto px-1.5 py-0.5 rounded shrink-0 ${
                                    isMe
                                      ? "text-accent-foreground bg-accent-foreground/15"
                                      : "text-muted-foreground bg-muted"
                                  }`}>
                                    {formatLobbyDuration(challenge.time)}
                                  </span>
                                </div>
                                {contentNode}
                              </div>
                            );
                          })()
                        ) : (
                          /* STANDARD BUBBLE */
                          <div
                            className={`rounded-2xl px-4 py-2 text-sm relative font-sans leading-relaxed break-words [word-break:break-word] ${
                              isMe
                                ? "bg-accent text-accent-foreground border border-accent/10 rounded-tr-sm"
                                : "bg-muted text-foreground border border-border rounded-tl-sm"
                            } ${reactions.length > 0 ? "mb-2" : ""}`}
                          >
                            <p className="whitespace-pre-wrap break-words [word-break:break-word]">{m.content}</p>

                            {/* Hover Reaction trigger button & Picker */}
                            {!isMe && (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center -right-8 z-30"
                              >
                                <button
                                  onClick={() => setActiveReactionPicker(activeReactionPicker === m.id ? null : m.id)}
                                  className="p-1 rounded-lg border border-border hover:border-foreground/50 hover:bg-muted text-foreground transition-all cursor-pointer"
                                  title="React with emoji"
                                >
                                  <Smile className="size-3.5" />
                                </button>

                                {/* Reaction Picker Popover */}
                                {activeReactionPicker === m.id && (
                                  <div
                                    className="absolute left-full ml-2 flex gap-1.5 p-1.5 border border-border bg-surface rounded-xl shadow-md z-40"
                                  >
                                    {["👍", "❤️", "😮", "😂", "😢"].map((emoji) => (
                                      <button
                                        key={emoji}
                                        onClick={() => handleAddReaction(m.id, emoji)}
                                        className="hover:scale-125 transition-transform p-0.5 text-sm cursor-pointer"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Reaction Badges Overlay */}
                            {reactions.length > 0 && (
                              <div className={`absolute -bottom-2.5 flex items-center gap-0.5 bg-surface border border-border rounded-full px-1.5 py-0.5 shadow-sm text-xs z-10 select-none max-w-full flex-wrap ${
                                isMe ? "-left-2" : "-right-2"
                              }`}>
                                {reactions.map((r, i) => (
                                  <span key={i}>{r}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Timestamp & Read Receipt */}
                      <div className="flex items-center gap-1.5 mt-0.5 px-1">
                        <span className="text-mono-sm text-muted-foreground/65">
                          {formatTime(m.createdAt)}
                        </span>
                        {isMe && (
                          <span className={cn(m.readStatus === "read" ? "text-accent" : "text-muted-foreground", "flex items-center")}>
                            {m.readStatus === "read" ? (
                              <CheckCheck className="size-3" />
                            ) : (
                              <Check className="size-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Typing indicator bubble */}
              {typingContact === selectedContact.id && (
                <div className="flex flex-col items-start">
                  <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="size-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="size-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-mono-sm text-muted-foreground mt-0.5 px-1">
                    {selectedContact.username} is typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Row */}
            <div className="p-4 border-t border-border flex gap-2 items-center bg-surface">
              <input
                type="text"
                placeholder="Type a message..."
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-0 px-4 py-2 rounded-xl bg-muted border border-border focus:border-foreground/50 text-sm text-foreground focus:outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim()}
                className="p-2 rounded-xl bg-accent text-accent-foreground disabled:opacity-50 disabled:pointer-events-none hover:bg-accent/90 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <Send className="size-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <MessageSquare className="size-12 text-muted-foreground/30 mb-3 animate-pulse" />
            <h3 className="font-display italic text-2xl text-foreground mb-1">Your Inbox</h3>
            <p className="text-sm font-sans max-w-sm">
              Select a conversation from the sidebar, or search for a friend to start planning your next Match.
            </p>
          </div>
        )}
      </section>



      {/* ────────────────────────────────────────────────────────
          4. NEW CHAT SELECTOR MODAL (FRIENDS LIST)
          ──────────────────────────────────────────────────────── */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display italic text-xl text-foreground">
                New Chat
              </h3>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Search Friends */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search friends..."
                value={newChatSearchQuery}
                onChange={(e) => setNewChatSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-muted border border-border focus:border-foreground/50 text-sm text-foreground focus:outline-none transition-all placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground"
              />
              <Search className="size-4 text-muted-foreground absolute left-3 top-2.5" />
            </div>

            <div className="flex-1 overflow-y-auto max-h-60 no-scrollbar divide-y divide-border">
              {(() => {
                const query = newChatSearchQuery.trim().toLowerCase();
                const filteredFriends = query
                  ? friends.filter((f) => f.username.toLowerCase().includes(query))
                  : friends;

                if (filteredFriends.length === 0) {
                  return (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      {query ? "No friends match your search." : "You have no friends to start a chat with."}
                    </div>
                  );
                }

                return filteredFriends.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => {
                      startChatWithUserId(f.id);
                      setShowNewChatModal(false);
                    }}
                    className="flex items-center gap-3 py-2.5 px-2 cursor-pointer hover:bg-muted rounded-lg transition-colors"
                  >
                    {f.avatarUrl ? (
                      <img src={f.avatarUrl} alt="" className="size-9 rounded-lg object-cover border border-border" />
                    ) : (
                      <div className="size-9 rounded-lg bg-muted flex items-center justify-center font-display italic text-sm text-foreground border border-border">
                        {f.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-sans text-sm font-semibold text-foreground">{f.username}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
