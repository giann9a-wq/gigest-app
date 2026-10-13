"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { chatMessageParts } from "@/lib/chat-mentions";

type OnlineUser = {
  id: string;
  label: string;
};
type MentionUser = OnlineUser & { email: string };

type ChatMessage = {
  id: string;
  senderId: string;
  senderLabel: string;
  message: string;
  createdAt: string;
  mentions: { userId: string; token: string; label: string }[];
};

async function jsonRequest<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore chat");
  }

  return data as T;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppChat() {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionCount, setMentionCount] = useState(0);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionSearch, setMentionSearch] = useState<{ start: number; end: number; query: string } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [draft, setDraft] = useState("");
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const openRef = useRef(false);
  const firstLoadRef = useRef(false);
  const mentionMessageRef = useRef<HTMLElement | null>(null);
  const suggestions = mentionSearch ? mentionUsers.filter((user) =>
    `${user.label} ${user.email}`.toLowerCase().includes(mentionSearch.query.toLowerCase())).slice(0, 8) : [];
  const lastMessageId = messages.at(-1)?.id;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const refreshPresence = useCallback(async () => {
    try {
      const data = await jsonRequest<{ users: OnlineUser[]; unreadCount: number; mentionCount: number }>("/api/chat/presence", {
        method: "POST",
      });
      setOnlineUsers(data.users);
      setUnreadCount(data.unreadCount);
      setMentionCount(data.mentionCount);
    } catch {
      // La presenza è accessoria: un errore temporaneo non deve disturbare la navigazione.
    }
  }, [isOpen]);

  const refreshMessages = useCallback(async (showLoader = false) => {
    if (showLoader) setLoadingMessages(true);

    try {
      if (document.visibilityState !== "visible" || !openRef.current) return;
      const data = await jsonRequest<{ currentUserId: string; messages: ChatMessage[]; readAt: string }>("/api/chat");
      if (!openRef.current || document.visibilityState !== "visible") return;
      setCurrentUserId(data.currentUserId);
      setMessages(data.messages);
      await jsonRequest("/api/chat/read", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: data.messages.map((message) => message.id), readAt: data.readAt }),
      });
      setUnreadCount(0);
      setMentionCount(0);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento della chat");
    } finally {
      if (showLoader) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    refreshPresence();
    const intervalId = window.setInterval(refreshPresence, 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshPresence();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshPresence]);

  useEffect(() => {
    if (!isOpen) return;

    refreshMessages(true);
    jsonRequest<{ users: MentionUser[] }>("/api/chat/users")
      .then((data) => setMentionUsers(data.users))
      .catch(() => setError("Impossibile caricare gli utenti da taggare. Riapri la chat per riprovare."));
    const intervalId = window.setInterval(() => refreshMessages(false), 3_000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, refreshMessages]);

  useEffect(() => {
    if (isOpen && lastMessageId) {
      if (firstLoadRef.current && mentionMessageRef.current) {
        mentionMessageRef.current.scrollIntoView({ block: "center" });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
      firstLoadRef.current = false;
    }
  }, [isOpen, lastMessageId]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");

    try {
      const data = await jsonRequest<{ message: ChatMessage }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mentionUserIds: selectedMentionIds }),
      });
      setMessages((current) => [...current.filter((item) => item.id !== data.message.id), data.message]);
      setDraft("");
      setSelectedMentionIds([]);
      setMentionSearch(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'invio del messaggio");
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSearch && suggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectMention(suggestions[Math.min(suggestionIndex, suggestions.length - 1)]);
        return;
      }
    }
    if (event.key === "Escape") { setMentionSearch(null); return; }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function openChat() {
    if (openRef.current) return;
    openRef.current = true;
    firstLoadRef.current = true;
    mentionMessageRef.current = null;
    setMessages([]);
    setIsOpen(true);
  }

  function closeChat() {
    openRef.current = false;
    setIsOpen(false);
  }

  function updateMentionSearch(value: string, caret: number) {
    const match = /(?:^|\s)@(\S*)$/.exec(value.slice(0, caret));
    setMentionSearch(match ? { start: caret - match[1].length - 1, end: caret, query: match[1] } : null);
    setSuggestionIndex(0);
  }

  function selectMention(user: MentionUser) {
    if (!mentionSearch) return;
    const token = `@${user.label} `;
    const next = draft.slice(0, mentionSearch.start) + token + draft.slice(mentionSearch.end);
    if (next.length > 2000) return;
    const caret = mentionSearch.start + token.length;
    setDraft(next);
    setSelectedMentionIds((ids) => [...new Set([...ids, user.id])]);
    setMentionSearch(null);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(caret, caret);
    });
  }

  return (
    <>
      <div className="app-chat-presence" aria-label="Utenti online">
        <div className="app-chat-online-list">
          {onlineUsers.map((user) => (
            <button key={user.id} type="button" className="app-chat-online-user" onClick={openChat}>
              <i aria-hidden="true" />
              <span>{user.label}</span>
            </button>
          ))}
        </div>
        <div className="app-chat-trigger">
        <span className="app-chat-mention-announcement" role="status" aria-live="polite">
          {mentionCount > 0 ? `Ti hanno taggato in chat: ${mentionCount} menzioni da leggere` : ""}
        </span>
        <button type="button" className={`app-chat-open-button ${mentionCount > 0 ? "app-chat-open-button-mentioned" : ""}`} onClick={openChat} aria-label={mentionCount > 0 ? `Apri chat: ${mentionCount} menzioni da leggere` : "Apri chat applicativo"}>
          <span>{mentionCount > 0 ? "@ Ti hanno taggato" : "Chat"}</span>
          {mentionCount > 0 ? <b>{mentionCount > 99 ? "99+" : mentionCount}</b> : null}
          {!mentionCount && unreadCount > 0 ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
        </button>
        </div>
      </div>

      {portalReady ? createPortal(<div className={`app-chat-shell ${isOpen ? "app-chat-shell-open" : ""}`} aria-hidden={!isOpen}>
        <button
          type="button"
          className="app-chat-backdrop"
          onClick={closeChat}
          aria-label="Chiudi chat"
          tabIndex={isOpen ? 0 : -1}
        />
        <aside className="app-chat-drawer" aria-label="Chat generale GiGEST">
          <header className="app-chat-drawer-header">
            <div>
              <span>Chat applicativo</span>
              <strong>Conversazione generale</strong>
              <small>{onlineUsers.length + 1} online</small>
            </div>
            <button type="button" onClick={closeChat} aria-label="Chiudi chat">×</button>
          </header>

          <div className="app-chat-messages" aria-live="polite">
            {loadingMessages ? <p className="app-chat-state">Caricamento messaggi...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="app-chat-state">Nessun messaggio. Inizia la conversazione con il team.</p>
            ) : null}
            {messages.map((message) => {
              const isMine = message.senderId === currentUserId;
              const isMentioned = message.mentions.some((mention) => mention.userId === currentUserId);
              return (
                <article key={message.id} ref={isMentioned ? (element) => { mentionMessageRef.current = element; } : undefined} className={`app-chat-message ${isMine ? "app-chat-message-mine" : ""} ${isMentioned ? "app-chat-message-mentioned" : ""}`}>
                  <div>
                    <strong>{isMine ? "Tu" : message.senderLabel}</strong>
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                  </div>
                  {isMentioned ? <small className="app-chat-tag-label">@ Ti ha taggato</small> : null}
                  <p>{chatMessageParts(message.message, message.mentions).map((part, index) =>
                    part.mentioned ? <mark key={index}>{part.text}</mark> : part.text
                  )}</p>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="app-chat-composer" onSubmit={sendMessage}>
            {error ? <p>{error}</p> : null}
            {mentionSearch ? <ul className="app-chat-suggestions" id="chat-mention-suggestions" aria-label="Utenti da taggare">
              {suggestions.map((user, index) => <li key={user.id}>
                <button type="button" className={index === suggestionIndex ? "is-selected" : ""}
                  onMouseDown={(event) => event.preventDefault()} onClick={() => selectMention(user)}>
                  <strong>{user.label}</strong><small>{user.email}</small>
                </button>
              </li>)}
              {!suggestions.length ? <li>Nessun utente trovato</li> : null}
            </ul> : null}
            <div>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(event) => { setDraft(event.target.value); updateMentionSearch(event.target.value, event.target.selectionStart); }}
                onClick={(event) => updateMentionSearch(event.currentTarget.value, event.currentTarget.selectionStart)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Scrivi un messaggio... usa @ per taggare"
                aria-label="Messaggio chat"
                maxLength={2000}
                rows={2}
              />
              <button type="submit" disabled={sending || !draft.trim()}>
                {sending ? "Invio..." : "Invia"}
              </button>
            </div>
            <small>@ per taggare · Invio con Enter · nuova riga con Shift+Enter</small>
          </form>
        </aside>
      </div>, document.body) : null}
    </>
  );
}
