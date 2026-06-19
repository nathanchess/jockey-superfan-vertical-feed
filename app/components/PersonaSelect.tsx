"use client";

import { useEffect, useRef, useState } from "react";
import { StrandIcon } from "@/components/StrandIcon";
import type { ProfileId } from "@/lib/types";

export type PersonaOption = {
  id: ProfileId;
  label: string;
  icon: string;
};

type PersonaSelectProps = {
  profiles: PersonaOption[];
  value: ProfileId;
  onChange: (id: ProfileId) => void;
};

export function PersonaSelect({ profiles, value, onChange }: PersonaSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = profiles.find((p) => p.id === value) ?? profiles[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-card"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected && (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-text-primary">
              <StrandIcon name={selected.icon} className="h-4 w-4" />
            </span>
            <span>{selected.label}</span>
          </>
        )}
        <StrandIcon
          name="arrow-box-down"
          className={`h-3 w-3 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-[100] mt-2 min-w-[200px] overflow-hidden rounded-lg border border-border-light bg-surface py-1 shadow-lg"
        >
          {profiles.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  p.id === value
                    ? "bg-accent-light text-text-primary"
                    : "text-text-primary hover:bg-card"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card">
                  <StrandIcon name={p.icon} className="h-4 w-4" />
                </span>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
