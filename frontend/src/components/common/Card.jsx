import "./Card.css";

export default function Card({ title, icon, actions, children, className = "" }) {
  return (
    <section className={`ui-card ${className}`}>
      {(title || actions) && (
        <header className="ui-card__header">
          <div className="ui-card__title">
            {icon ? <span className="ui-card__icon">{icon}</span> : null}
            {title ? <span>{title}</span> : null}
          </div>

          {actions ? <div className="ui-card__actions">{actions}</div> : null}
        </header>
      )}

      <div className="ui-card__body">{children}</div>
    </section>
  );
}
