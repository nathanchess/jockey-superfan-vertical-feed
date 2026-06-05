"use client";

type InfoTooltipProps = {
  content: string;
  label: string;
  className?: string;
};

/** Tooltip visible only when hovering or focusing the info control. */
export function InfoTooltip({ content, label, className = "" }: InfoTooltipProps) {
  return (
    <span className={`group/info relative inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        className="rounded-full p-0.5 text-text-tertiary hover:bg-background hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={label}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 7V4.75h1.5V7h-1.5Zm0 4.25V8.5h1.5v2.75h-1.5ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Z" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-text-secondary opacity-0 shadow-lg transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
