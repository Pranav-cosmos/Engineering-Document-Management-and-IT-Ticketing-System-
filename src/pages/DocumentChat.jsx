import { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";

export default function DocumentChat() {
    const [question, setQuestion] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to the bottom whenever messages update
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const askQuestion = async () => {
        if (!question.trim()) return;

        const currentQuestion = question;

        setMessages((prev) => [
            ...prev,
            { type: "user", content: currentQuestion },
        ]);

        setQuestion("");
        setLoading(true);

        try {
            const response = await fetch("http://localhost:8000/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: currentQuestion }),
            });

            const data = await response.json();

            setMessages((prev) => [
                ...prev,
                {
                    type: "assistant",
                    answer: data.answer,
                    sources: data.sources || [],
                },
            ]);
        } catch (error) {
            console.error(error);
            setMessages((prev) => [
                ...prev,
                {
                    type: "assistant",
                    answer: "Unable to connect to the AI service. Please ensure the backend is running.",
                    sources: [],
                },
            ]);
        }

        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            askQuestion();
        }
    };

    return (
        <div className="layout">
            <Sidebar />
            <div className="content">
                <div className="chat-page">
                    {/* ── Page Header ── */}
                    <div className="chat-page-header">
                        <h1>🤖 AI Document Assistant</h1>
                        <p>Ask questions about the uploaded engineering documents.</p>
                    </div>

                    {/* ── Message List ── */}
                    <div className="chat-messages">
                        {messages.length === 0 && !loading && (
                            <div className="chat-empty">
                                <div className="chat-empty-icon">💬</div>
                                <h3>Start a conversation</h3>
                                <p>
                                    Ask anything about the uploaded documents — technical specs,
                                    procedures, or any engineering detail.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`chat-bubble-row ${msg.type}`}
                            >
                                <span className={`chat-sender ${msg.type}`}>
                                    {msg.type === "user" ? "You" : "AI Assistant"}
                                </span>

                                <div className={`chat-bubble ${msg.type}`}>
                                    {msg.type === "user" ? (
                                        <p>{msg.content}</p>
                                    ) : (
                                        <>
                                            <p>{msg.answer}</p>

                                            {msg.sources && msg.sources.length > 0 && (
                                                <div className="chat-sources">
                                                    <div className="chat-sources-title">
                                                        📎 Source Chunks
                                                    </div>

                                                    {msg.sources.map((source, sourceIndex) => (
                                                        <div
                                                            key={sourceIndex}
                                                            className="chat-source-item"
                                                        >
                                                            <div className="chat-source-score">
                                                                ✦ Similarity:{" "}
                                                                {typeof source.score === "number"
                                                                    ? source.score.toFixed(4)
                                                                    : source.score}
                                                            </div>
                                                            <p className="chat-source-text">
                                                                {source.chunk?.substring(0, 300)}…
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* ── Thinking indicator ── */}
                        {loading && (
                            <div className="chat-bubble-row assistant">
                                <span className="chat-sender assistant">AI Assistant</span>
                                <div className="chat-thinking">
                                    <div className="chat-thinking-dots">
                                        <span />
                                        <span />
                                        <span />
                                    </div>
                                    <span className="chat-thinking-text">Thinking…</span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── Input Bar ── */}
                    <div className="chat-input-bar">
                        <textarea
                            className="chat-input"
                            rows={1}
                            placeholder="Ask a question… (Shift+Enter for new line)"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            className="chat-send-btn"
                            onClick={askQuestion}
                            disabled={loading || !question.trim()}
                        >
                            {loading ? "Thinking…" : "Send ➤"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}