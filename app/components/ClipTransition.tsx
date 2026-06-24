"use client";

import type { ReactNode } from "react";

export type SlideDirection = "up" | "down";

type ClipTransitionProps = {
  clipKey: string;
  direction: SlideDirection;
  children: ReactNode;
  className?: string;
  /** Fill parent height (video panel). */
  fill?: boolean;
};

export function ClipTransition({
  clipKey,
  direction,
  children,
  className = "",
  fill = false,
}: ClipTransitionProps) {
  const animClass =
    direction === "down" ? "clip-enter-from-below" : "clip-enter-from-above";

  return (
    <div
      key={clipKey}
      className={`${animClass} ${fill ? "h-full w-full" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
