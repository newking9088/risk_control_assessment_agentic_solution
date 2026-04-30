import { useState, useRef, useEffect } from "react";
import { MessageSquare, Sparkles, X, Minus, Send } from "lucide-react";
import styles from "./ChatWidget.module.scss";

type PanelState = "closed" | "open" | "minimized";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SESSION_ID = crypto.randomUUID();

export function ChatWidget({ assessmentId }: { assessmentId?: string }) {
  const [panelState, setPanelState] = useState<PanelState>("closed");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [unread, setUnread] = useState(0);
  const [bottomOffset, setBottomOffset] = useState("1.5rem");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (panelState === "open") {
      setTimeout(() => inputRef.current?.focus(), 100);
      setUnread(0);
    }
  }, [panelState]);

  // Programmatic open via CustomEvent
  useEffect(() => {
    function handle(e: Event) {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt ?? "";
      setInput(prompt);
      setPanelState("open");
    }
    window.addEventListener("ai-refine", handle);
    window.addEventListener("ai-qa-ask", handle);
    return () => {
      window.removeEventListener("ai-refine", handle);
      window.removeEventListener("ai-qa-ask", handle);
    };
  }, []);

  // Dynamic bottom offset — avoid overlapping sticky footer
  useEffect(() => {
    function measure() {
      const footer = document.querySelector("footer");
      if (footer) {
        const rect = footer.getBoundingClientRect();
        const visible = Math.max(0, window.innerHeight - rect.top);
        setBottomOffset(visible > 0 ? `${visible + 16}px` : "1.5rem");
      }
    }
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setMessages((m) => [...m, { role: "assistant", content: "", streaming: true }]);
    setStreaming(true);

    try {
      const resp = await fetch("/api/v1/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: SESSION_ID,
          message: text,
          assessment_id: assessmentId ?? null,
        }),
      });

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "chat:token") {
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last?.streaming) copy[copy.length - 1] = { ...last, content: last.content + ev.token };
                return copy;
              });
            } else if (ev.type === "chat:done") {
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last?.streaming) copy[copy.length - 1] = { ...last, streaming: false };
                return copy;
              });
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.streaming) copy[copy.length - 1] = { role: "assistant", content: "Could not reach AI service. Please try again." };
        return copy;
      });
    } finally {
      setStreaming(false);
      if (panelState !== "open") setUnread((n) => n + 1);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (panelState === "minimized") {
    return (
      <div
        className={styles.pill}
        style={{ bottom: bottomOffset }}
        onClick={() => setPanelState("open")}
        role="button"
        tabIndex={0}
        aria-label="Restore AI Assistant"
        onKeyDown={(e) => e.key === "Enter" && setPanelState("open")}
      >
        <MessageSquare size={14} />
        <span>AI Assistant</span>
        {unread > 0 && <span className={styles.badge}>{unread}</span>}
      </div>
    );
  }

  if (panelState === "closed") {
    return (
      <button
        className={styles.fab}
        style={{ bottom: bottomOffset }}
        onClick={() => setPanelState("open")}
        title="Open AI Assistant"
        aria-label="Open AI Assistant"
      >
        <MessageSquare size={20} color="white" />
        <span className={styles.aiBadge}>AI</span>
      </button>
    );
  }

  return (
    <>
      {/* FAB anchor stays visible when panel is open */}
      <button
        className={styles.fab}
        style={{ bottom: bottomOffset }}
        onClick={() => setPanelState("closed")}
        title="Close AI Assistant"
        aria-label="Close AI Assistant"
      >
        <X size={20} color="white" />
      </button>

      <div
        className={styles.panel}
        style={{ bottom: `calc(${bottomOffset} + 64px)` }}
        role="dialog"
        aria-modal="false"
        aria-label="AI Risk Assistant"
      >
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <Sparkles size={16} />
            AI Risk Assistant
          </div>
          <div className={styles.panelActions}>
            <button onClick={() => setPanelState("minimized")} title="Minimize" aria-label="Minimize">
              <Minus size={14} />
            </button>
            <button onClick={() => setPanelState("closed")} title="Close" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className={styles.messages}>
          {messages.length === 0 && (
            <p className={styles.empty}>Ask me anything about risks, controls, or assessment ratings.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? styles.userMsg : styles.assistantMsg}>
              <span className={styles.msgContent}>
                {m.content}
                {m.streaming && <span className={styles.cursor}>▋</span>}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about risks, controls, ratings… (Enter to send)"
            rows={2}
            disabled={streaming}
          />
          <button
            className={styles.sendBtn}
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
