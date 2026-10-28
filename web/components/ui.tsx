"use client";

// Small presentational building blocks shared across pages.
import type { LucideIcon } from "lucide-react";
import { Inbox, Loader2 } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "amber" | "teal" | "rose" | "green";
}) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon">
        <Icon size={18} />
      </div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  icon: Icon,
  actions,
  children,
  className = "",
}: {
  title?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && (
            <h2>
              {Icon && <Icon size={16} />} {title}
            </h2>
          )}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <div className="empty-title">{title}</div>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner">
      <Loader2 size={16} className="spin" /> {label}
    </span>
  );
}

export function LoadingBlock() {
  return (
    <div className="loading-block">
      <Spinner label="Loading data…" />
    </div>
  );
}

export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Badge({ tone = "default", children }: { tone?: "default" | "amber" | "teal" | "rose" | "green" | "slate"; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "amber" | "teal" | "rose" }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

// A route sequence shown as chips joined by arrows.
export function SequenceChips({ seq, nameOf, tone = "teal" }: { seq: string[]; nameOf: (id: string) => string; tone?: "teal" | "rose" | "amber" }) {
  return (
    <div className="seq">
      {seq.map((id, i) => (
        <span key={`${id}-${i}`} className="seq-item">
          <Chip tone={id === seq[0] ? "amber" : tone}>
            {id !== seq[0] && <b className="seq-num">{i}</b>}
            {nameOf(id)}
          </Chip>
          {i < seq.length - 1 && <span className="seq-arrow">→</span>}
        </span>
      ))}
    </div>
  );
}
