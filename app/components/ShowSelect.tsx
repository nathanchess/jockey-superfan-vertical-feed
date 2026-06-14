"use client";

import { useEffect, useRef, useState } from "react";
import { StrandIcon } from "@/components/StrandIcon";
import { isPasswordProtected, type ShowId } from "@/lib/shows";
import type { ShowCatalogEntry } from "@/lib/types";

type ShowSelectProps = {
  shows: ShowCatalogEntry[];
  value: ShowId;
  onChange: (id: ShowId) => void;
  collapsed?: boolean;
};

type PasswordState = {
  showId: ShowId;
  input: string;
  error: string | null;
  checking: boolean;
};

export function ShowSelect({ shows, value, onChange, collapsed = false }: ShowSelectProps) {
  const [open, setOpen] = useState(false);
  const [passwordState, setPasswordState] = useState<PasswordState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const selected = shows.find((s) => s.id === value) ?? shows[0];

  // Close dropdown on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPasswordState(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Focus password input when prompt appears
  useEffect(() => {
    if (passwordState) {
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }, [passwordState?.showId]);

  if (shows.length === 0 || !selected) return null;

  function handleShowClick(show: ShowCatalogEntry) {
    if (show.id === value) {
      setOpen(false);
      return;
    }
    if (isPasswordProtected(show.id)) {
      setOpen(false);
      setPasswordState({ showId: show.id, input: "", error: null, checking: false });
      return;
    }
    onChange(show.id);
    setOpen(false);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordState || passwordState.checking) return;

    setPasswordState((s) => s && { ...s, checking: true, error: null });

    try {
      const res = await fetch(`/api/shows/${passwordState.showId}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordState.input }),
      });

      if (res.ok) {
        onChange(passwordState.showId);
        setPasswordState(null);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setPasswordState((s) => s && {
          ...s,
          checking: false,
          error: data.error ?? "Incorrect password.",
        });
      }
    } catch {
      setPasswordState((s) => s && { ...s, checking: false, error: "Network error. Try again." });
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setPasswordState(null);
          setOpen((o) => !o);
        }}
        title={selected.label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Current show: ${selected.label}. Click to change.`}
        className={`flex w-full items-center rounded-md text-sm font-system transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          collapsed
            ? "justify-center px-2 py-2.5 text-text-secondary hover:bg-card hover:text-text-primary"
            : `gap-3 px-3 py-2 ${open ? "bg-card text-text-primary" : "text-text-primary hover:bg-card"}`
        }`}
      >
        <StrandIcon name="indexes" className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
            {shows.length > 1 && (
              <StrandIcon
                name="arrow-box-down"
                className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200 ${
                  open ? "rotate-180" : ""
                }`}
              />
            )}
          </>
        )}
      </button>

      {/* Show list dropdown */}
      {open && (
        <ul
          role="listbox"
          aria-label="Select show"
          className={`absolute z-50 overflow-hidden rounded-lg border border-border bg-surface shadow-lg ${
            collapsed
              ? "bottom-0 left-full ml-2 min-w-[240px]"
              : "bottom-full left-0 right-0 mb-1"
          }`}
        >
          {shows.map((show) => {
            const isSelected = show.id === value;
            const locked = isPasswordProtected(show.id);
            return (
              <li key={show.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => handleShowClick(show)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-system transition-colors ${
                    isSelected
                      ? "bg-brand-charcoal text-text-inverse"
                      : locked
                      ? "text-text-tertiary hover:bg-card hover:text-text-secondary"
                      : "text-text-primary hover:bg-card"
                  }`}
                >
                  <StrandIcon
                    name="indexes"
                    className={`h-4 w-4 shrink-0 ${
                      isSelected ? "text-text-inverse" : locked ? "text-text-tertiary" : "text-text-secondary"
                    }`}
                  />
                  <span className={`min-w-0 flex-1 truncate ${locked && !isSelected ? "blur-[2px]" : ""}`}>
                    {show.label}
                  </span>
                  {isSelected && (
                    <StrandIcon name="checkmark" className="h-4 w-4 shrink-0 text-text-inverse" />
                  )}
                  {locked && (
                    <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      isSelected
                        ? "bg-white/20 text-text-inverse"
                        : "bg-border/60 text-text-tertiary"
                    }`}>
                      <StrandIcon name="lock" className="h-2.5 w-2.5 shrink-0" />
                      Private
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Inline password prompt (shown below trigger when a locked show is selected) */}
      {passwordState && (
        <div
          className={`absolute z-50 rounded-lg border border-border bg-surface p-3 shadow-lg ${
            collapsed ? "bottom-0 left-full ml-2 w-[240px]" : "bottom-full left-0 right-0 mb-1"
          }`}
        >
          <p className="mb-2 text-xs font-medium text-text-secondary">
            Password required for{" "}
            <span className="text-text-primary">
              {shows.find((s) => s.id === passwordState.showId)?.label}
            </span>
          </p>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2">
            <input
              ref={passwordInputRef}
              type="password"
              placeholder="Enter password"
              value={passwordState.input}
              onChange={(e) =>
                setPasswordState((s) => s && { ...s, input: e.target.value, error: null })
              }
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              autoComplete="off"
            />
            {passwordState.error && (
              <p className="text-xs text-red-500">{passwordState.error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={passwordState.checking || !passwordState.input}
                className="flex-1 rounded-md bg-brand-charcoal px-3 py-1.5 text-xs font-medium text-text-inverse transition-opacity disabled:opacity-50"
              >
                {passwordState.checking ? "Checking…" : "Unlock"}
              </button>
              <button
                type="button"
                onClick={() => setPasswordState(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-card"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
