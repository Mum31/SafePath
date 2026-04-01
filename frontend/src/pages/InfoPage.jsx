import React from 'react';
import { Link } from 'react-router-dom';

export default function InfoPage({
  eyebrow,
  title,
  intro,
  sections = [],
  highlights = [],
  actions = [],
}) {
  return (
    <section className="info-page">
      <div className="info-page-shell">
        <div className="info-page-hero">
          {eyebrow ? <span className="info-page-eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>

        {actions.length > 0 ? (
          <div className="info-page-actions">
            {actions.map((action) => (
              action.external ? (
                <a
                  key={action.label}
                  href={action.to}
                  className={`info-page-action ${action.variant === 'secondary' ? 'secondary' : ''}`}
                  target={action.target || undefined}
                  rel={action.rel || undefined}
                >
                  {action.label}
                </a>
              ) : (
                <Link
                  key={action.label}
                  to={action.to}
                  className={`info-page-action ${action.variant === 'secondary' ? 'secondary' : ''}`}
                >
                  {action.label}
                </Link>
              )
            ))}
          </div>
        ) : null}

        {highlights.length > 0 ? (
          <div className="info-page-highlight-grid">
            {highlights.map((highlight) => (
              <article key={highlight.title} className="info-page-highlight-card">
                <span>{highlight.kicker}</span>
                <strong>{highlight.title}</strong>
                <p>{highlight.text}</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="info-page-section-grid">
          {sections.map((section) => (
            <article key={section.title} className="info-page-card">
              <h2>{section.title}</h2>
              {section.body ? <p>{section.body}</p> : null}
              {section.items?.length ? (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
