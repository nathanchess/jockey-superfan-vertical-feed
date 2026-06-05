"use client";

import { useMemo, useState } from "react";
import { StrandIcon } from "@/components/StrandIcon";
import {
  EXPLORE_RAW_COLUMNS,
  buildExploreRawRows,
  downloadExploreRawXlsx,
  type GridClip,
} from "@/lib/exploreRawData";

type ExploreRawDataPanelProps = {
  open: boolean;
  clips: GridClip[];
  showName: string | null;
  profileLabel: string;
  activeQuery: string | null;
};

export function ExploreRawDataPanel({
  open,
  clips,
  showName,
  profileLabel,
  activeQuery,
}: ExploreRawDataPanelProps) {
  const [downloading, setDownloading] = useState(false);

  const rows = useMemo(
    () => buildExploreRawRows(clips, showName),
    [clips, showName],
  );

  const filename = useMemo(() => {
    const slug = (activeQuery ?? profileLabel)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const date = new Date().toISOString().slice(0, 10);
    return `explore-clips-${slug || "feed"}-${date}.xlsx`;
  }, [activeQuery, profileLabel]);

  const onDownload = async () => {
    if (rows.length === 0 || downloading) return;
    setDownloading(true);
    try {
      await downloadExploreRawXlsx(rows, filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={`explore-raw-panel ${open ? "explore-raw-panel--open" : ""}`}
      aria-hidden={!open}
    >
      <div className="explore-raw-panel__inner">
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm ring-1 ring-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Pegasus / Jockey Clip Metadata
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {rows.length} clip{rows.length === 1 ? "" : "s"} · {profileLabel}
                {activeQuery ? ` · “${activeQuery}”` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onDownload}
              disabled={rows.length === 0 || downloading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-card disabled:opacity-40"
            >
              <StrandIcon name="arrow-box-down" className="h-4 w-4 text-accent" />
              {downloading ? "Preparing…" : "Download .XLSX"}
            </button>
          </div>

          <div className="max-h-[min(52vh,520px)] overflow-auto">
            <table className="explore-raw-table min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-brand-charcoal text-text-inverse">
                <tr>
                  {EXPLORE_RAW_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap border border-border/30 px-3 py-2.5 font-semibold"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.clipNumber} className="explore-raw-table__row">
                    {EXPLORE_RAW_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="max-w-xs border border-border-light px-3 py-2 align-top text-text-secondary"
                      >
                        {String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExploreRawDataToggle({
  open,
  disabled,
  onToggle,
}: {
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-card hover:text-text-primary disabled:opacity-40"
    >
      <StrandIcon name="document-list" className="h-3.5 w-3.5" />
      {open ? "Hide Raw Data" : "View Raw Data"}
    </button>
  );
}
