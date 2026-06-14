"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_SHOW_ID, type ShowId } from "@/lib/shows";
import type { ShowCatalogEntry } from "@/lib/types";

const STORAGE_KEY = "superfan-selected-show";

type ShowContextValue = {
  showId: ShowId;
  setShowId: (id: ShowId) => void;
  shows: ShowCatalogEntry[];
  currentShow: ShowCatalogEntry | null;
  ready: boolean;
};

const ShowContext = createContext<ShowContextValue | null>(null);

export function ShowProvider({ children }: { children: ReactNode }) {
  const [shows, setShows] = useState<ShowCatalogEntry[]>([]);
  const [showId, setShowIdState] = useState<ShowId>(DEFAULT_SHOW_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/shows")
      .then((r) => r.json())
      .then((data: { default_show: ShowId; shows: ShowCatalogEntry[] }) => {
        setShows(data.shows);
        const stored = localStorage.getItem(STORAGE_KEY);
        const validStored =
          stored && data.shows.some((s) => s.id === stored) ? (stored as ShowId) : null;
        setShowIdState(validStored ?? data.default_show ?? DEFAULT_SHOW_ID);
      })
      .catch(() => {
        setShows([]);
        setShowIdState(DEFAULT_SHOW_ID);
      })
      .finally(() => setReady(true));
  }, []);

  const setShowId = useCallback((id: ShowId) => {
    setShowIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const currentShow = useMemo(
    () => shows.find((s) => s.id === showId) ?? null,
    [shows, showId],
  );

  const value = useMemo(
    () => ({ showId, setShowId, shows, currentShow, ready }),
    [showId, setShowId, shows, currentShow, ready],
  );

  return <ShowContext.Provider value={value}>{children}</ShowContext.Provider>;
}

export function useShow() {
  const ctx = useContext(ShowContext);
  if (!ctx) throw new Error("useShow must be used within ShowProvider");
  return ctx;
}
