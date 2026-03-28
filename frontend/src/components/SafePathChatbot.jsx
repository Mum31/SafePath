import React, { useEffect, useRef, useState } from 'react';
import { BellRing, MessageCircleMore, Send, Sparkles, X } from 'lucide-react';

import { sendChatbotMessage } from '../services/api';

const QUICK_PROMPTS = [
  'Je veux aller de Republique a Bastille a 18h sans foule',
  'Explique-moi les niveaux de densite',
  'Alerte foule a Chatelet a 18h ?',
  "J'ai peur de la foule, aide-moi a choisir un trajet rassurant",
];

const INITIAL_MESSAGE = {
  role: 'assistant',
  text:
    "Je peux vous aider a choisir un trajet plus calme, expliquer la densite et signaler les heures a eviter. Essayez par exemple: 'Je veux aller de Republique a Bastille a 18h sans foule'.",
};

function formatDateTime(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function RouteSummaryCard({ summary }) {
  if (!summary) return null;

  return (
    <div className="chatbot-data-card">
      <div className="chatbot-data-head">
        <span className="chatbot-data-eyebrow">Trajet recommande</span>
        <strong>
          {summary.origin} -&gt; {summary.destination}
        </strong>
      </div>

      <div className="chatbot-pill-row">
        <span className="chatbot-pill">{summary.recommended_mode_label || summary.recommended_mode}</span>
        <span className="chatbot-pill">{summary.duration_minutes} min</span>
        <span className="chatbot-pill">Calme {summary.calm_score}/100</span>
        <span className="chatbot-pill">Densite {summary.average_density_pct}%</span>
      </div>

      {summary.travel_datetime && (
        <p className="chatbot-data-note">Depart vise: {formatDateTime(summary.travel_datetime)}</p>
      )}

      {!!summary.quieter_windows?.length && (
        <div className="chatbot-mini-grid">
          {summary.quieter_windows.slice(0, 3).map((slot) => (
            <div key={`${slot.label}-${slot.density_pct}`} className="chatbot-mini-card">
              <span>{slot.label}</span>
              <strong>{slot.density_pct}%</strong>
            </div>
          ))}
        </div>
      )}

      {!!summary.alternatives?.length && (
        <div className="chatbot-alt-list">
          {summary.alternatives.slice(0, 3).map((route) => (
            <div key={route.id || `${route.mode}-${route.duration_minutes}`} className="chatbot-alt-item">
              <strong>{route.mode_label || route.mode}</strong>
              <span>{route.duration_minutes} min</span>
              <span>{route.average_density_pct}% densite</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DensityOverviewCard({ overview }) {
  if (!overview) return null;

  return (
    <div className="chatbot-data-card">
      <div className="chatbot-data-head">
        <span className="chatbot-data-eyebrow">Lecture densite</span>
        <strong>{overview.label || 'SafePath'}</strong>
      </div>

      {overview.density_pct != null && (
        <div className="chatbot-pill-row">
          <span className="chatbot-pill">{overview.density_pct}%</span>
          <span className="chatbot-pill">{overview.level}</span>
        </div>
      )}

      {!!overview.quieter_windows?.length && (
        <div className="chatbot-mini-grid">
          {overview.quieter_windows.slice(0, 3).map((slot) => (
            <div key={`${slot.label}-${slot.density_pct}`} className="chatbot-mini-card">
              <span>{slot.label}</span>
              <strong>{slot.density_pct}%</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SafePathChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, loading, isOpen]);

  const submitMessage = async (rawMessage) => {
    const cleanMessage = rawMessage.trim();
    if (!cleanMessage || loading) return;

    const history = [
      ...messages.map((message) => ({ role: message.role, content: message.text })),
      { role: 'user', content: cleanMessage },
    ];

    setIsOpen(true);
    setMessages((current) => [...current, { role: 'user', text: cleanMessage }]);
    setInput('');
    setLoading(true);

    try {
      const payload = await sendChatbotMessage(cleanMessage, history);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: payload.reply,
          routeSummary: payload.route_summary,
          densityOverview: payload.density_overview,
          alerts: payload.alerts || [],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text:
            error.response?.data?.error ||
            "Je n'ai pas reussi a repondre pour l'instant. Reessayez dans quelques secondes.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`chatbot-fab ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? 'Fermer le chatbot' : 'Ouvrir le chatbot'}
      >
        {isOpen ? <X size={22} /> : <MessageCircleMore size={22} />}
        <span>Assistant SafePath</span>
      </button>

      {isOpen && (
        <section className="chatbot-shell" aria-label="Assistant SafePath">
          <header className="chatbot-header">
            <div>
              <span className="chatbot-kicker">Planifier sans stress</span>
              <h2>Compagnon SafePath</h2>
              <p>Trajets calmes, densite et alertes utiles.</p>
            </div>
            <button type="button" className="chatbot-close" onClick={() => setIsOpen(false)} aria-label="Fermer">
              <X size={18} />
            </button>
          </header>

          <div className="chatbot-prompts">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => submitMessage(prompt)}>
                <Sparkles size={14} />
                <span>{prompt}</span>
              </button>
            ))}
          </div>

          <div ref={feedRef} className="chatbot-feed">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`chatbot-message ${message.role}`}>
                <div className="chatbot-bubble">
                  <p>{message.text}</p>
                  <RouteSummaryCard summary={message.routeSummary} />
                  <DensityOverviewCard overview={message.densityOverview} />
                  {!!message.alerts?.length && (
                    <div className="chatbot-alerts">
                      {message.alerts.map((alert, alertIndex) => (
                        <div key={`${alert.title}-${alertIndex}`} className={`chatbot-alert ${alert.level || 'medium'}`}>
                          <BellRing size={14} />
                          <span>{alert.text || alert.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}

            {loading && (
              <div className="chatbot-typing" aria-live="polite">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <footer className="chatbot-footer">
            <label className="chatbot-input-wrap">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitMessage(input);
                  }
                }}
                placeholder="Ex: Republique -> Bastille a 18h sans foule"
              />
              <button type="button" onClick={() => submitMessage(input)} disabled={loading}>
                <Send size={16} />
              </button>
            </label>
          </footer>
        </section>
      )}
    </>
  );
}
