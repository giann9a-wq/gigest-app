"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

type OnlineUser = {
  id: string;
  label: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderLabel: string;
  message: string;
  createdAt: string;
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
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastMessageId = messages.at(-1)?.id;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const refreshPresence = useCallback(async () => {
    try {
      const data = await jsonRequest<{ users: OnlineUser[]; unreadCount: number }>("/api/chat/presence", {
        method: "POST",
      });
      setOnlineUsers(data.users);
      if (!isOpen) setUnreadCount(data.unreadCount);
    } catch {
      // La presenza è accessoria: un errore temporaneo non deve disturbare la navigazione.
    }
  }, [isOpen]);

  const refreshMessages = useCallback(async (showLoader = false) => {
    if (showLoader) setLoadingMessages(true);

    try {
      const data = await jsonRequest<{ currentUserId: string; messages: ChatMessage[] }>("/api/chat");
      setCurrentUserId(data.currentUserId);
      setMessages(data.messages);
      setUnreadCount(0);
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
    const intervalId = window.setInterval(() => refreshMessages(false), 3_000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, refreshMessages]);

  useEffect(() => {
    if (isOpen && lastMessageId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
        body: JSON.stringify({ message }),
      });
      setMessages((current) => [...current.filter((item) => item.id !== data.message.id), data.message]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'invio del messaggio");
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function openChat() {
    setIsOpen(true);
    setUnreadCount(0);
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
        <button type="button" className="app-chat-open-button" onClick={openChat} aria-label="Apri chat applicativo">
          <span>Chat</span>
          {unreadCount > 0 ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
        </button>
      </div>

      {portalReady ? createPortal(<div className={`app-chat-shell ${isOpen ? "app-chat-shell-open" : ""}`} aria-hidden={!isOpen}>
        <button
          type="button"
          className="app-chat-backdrop"
          onClick={() => setIsOpen(false)}
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
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Chiudi chat">×</button>
          </header>

          <div className="app-chat-messages" aria-live="polite">
            {loadingMessages ? <p className="app-chat-state">Caricamento messaggi...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="app-chat-state">Nessun messaggio. Inizia la conversazione con il team.</p>
            ) : null}
            {messages.map((message) => {
              const isMine = message.senderId === currentUserId;
              return (
                <article key={message.id} className={`app-chat-message ${isMine ? "app-chat-message-mine" : ""}`}>
                  <div>
                    <strong>{isMine ? "Tu" : message.senderLabel}</strong>
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                  </div>
                  <p>{message.message}</p>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="app-chat-composer" onSubmit={sendMessage}>
            {error ? <p>{error}</p> : null}
            <div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Scrivi un messaggio..."
                maxLength={2000}
                rows={2}
              />
              <button type="submit" disabled={sending || !draft.trim()}>
                {sending ? "Invio..." : "Invia"}
              </button>
            </div>
            <small>Invio con Enter · nuova riga con Shift+Enter</small>
          </form>
        </aside>
      </div>, document.body) : null}
    </>
  );
}
