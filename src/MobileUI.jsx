import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
export function Tag({ children, tone = "" }) {
  return <span className={`m-tag ${tone}`}>{children}</span>;
}
export function MButton({
  children,
  secondary = false,
  danger = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`m-button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Row({ icon: Icon, title, description, tail, onClick }) {
  const inner = (
    <>
      <span className="m-row-icon">{Icon && <Icon size={21} />}</span>
      <span className="m-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      {tail && <span className="m-row-tail">{tail}</span>}
      {onClick && <ChevronRight size={16} />}
    </>
  );
  return onClick ? (
    <button className="m-row" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="m-row">{inner}</div>
  );
}
export function Sheet({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const prior = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => prior?.focus?.({ preventScroll: true });
  }, []);
  return (
    <div
      className="m-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={ref}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "Tab") {
          const items = [
            ...ref.current.querySelectorAll(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
            ),
          ];
          const first = items[0],
            last = items.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === ref.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header>
        <button aria-label="返回" onClick={onClose}>
          <ChevronLeft size={22} />
        </button>
        <h2>{title}</h2>
        <button aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="m-sheet-body">{children}</div>
    </div>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="m-field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
