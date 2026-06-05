"use client";

import type { ReactNode } from "react";

export type SlideDirection = "up" | "down";

type ClipTransitionProps = {
  clipKey: string;
  direction: SlideDirection;
  children: ReactNode;
  className?: string;
};

export function ClipTransition({
  clipKey,
  direction,
  children,
  className = "",
}: ClipTransitionProps) {
  const animClass =
    direction === "down" ? "clip-enter-from-below" : "clip-enter-from-above";

  return (
    <div key={clipKey} className={`${animClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
