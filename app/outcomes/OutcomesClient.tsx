"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { WuOutcome } from "@/lib/types";

type DraftRow = {
  key: string;
  date: string;
  finalHigh: string;
  source: string;
  verified: boolean;
};

function makeBlankRow(): DraftRow {
  return {
    key: Math.random().toString(36).slice(2),
    date: "",
    finalHigh: "",
    source: "WU",
    verified: true,
  };
}

function makeInitialRows(count = 6): DraftRow[] {
  return Array.from({ length: count }, () => makeBlankRow());
}

function sortDesc(outcomes: WuOutcome[]): WuOutcome[] {
  return [...outcomes].sort((a, b) => b.date.localeCompare(a.date));
}

export default function OutcomesClient({
  initialOutcomes,
}: {
  initialOutcomes: WuOutcome[];
}) {
  const [outcomes, setOutcomes] = useState<WuOutcome[]>(sortDesc(initialOutcomes));
  const [rows, setRows] = useState<DraftRow[]>(makeInitialRows());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ finalHigh: "", source: "WU", verified: true });

  const dateRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (!pendingFocusKey) return;
    const el = dateRefs.current.get(pendingFocusKey);
    el?.focus();
    setPendingFocusKey(null);
  }, [pendingFocusKey, rows]);

  function updateRow(key: string, field: keyof DraftRow, value: string | boolean) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function addRow() {
    const row = makeBlankRow();
    setRows((prev) => [...prev, row]);
    setPendingFocusKey(row.key);
  }

  function handleTempKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (index === rows.length - 1) {
      const row = makeBlankRow();
      setRows((prev) => [...prev, row]);
      setPendingFocusKey(row.key);
    } else {
      setPendingFocusKey(rows[index + 1].key);
    }
  }

  async function saveBatch() {
    const filled = rows.filter((r) => r.date.trim() !== "" && r.finalHigh.trim() !== "");

    if (filled.length === 0) {
      setError("Nothing to save — fill in at least one row.");
      return;
    }

    const entries = [];
    for (const r of filled) {
      const finalHigh = Number(r.finalHigh);
      if (!Number.isInteger(finalHigh)) {
        setError(`Final high must be a whole number (row: ${r.date || "?"})`);
        return;
      }
      entries.push({
        date: r.date,
        final_high_f: finalHigh,
        source: r.source.trim() || "WU",
        is_verified: r.verified,
      });
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      const saved: WuOutcome[] = json.outcomes;
      setOutcomes((prev) => {
        const map = new Map(prev.map((o) => [o.date, o]));
        for (const o of saved) map.set(o.date, o);
        return sortDesc(Array.from(map.values()));
      });
      setMessage(`Saved ${saved.length} ${saved.length === 1 ? "entry" : "entries"}.`);
      setRows(makeInitialRows());
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(o: WuOutcome) {
    setEditingDate(o.date);
    setEditDraft({ finalHigh: String(o.final_high_f), source: o.source, verified: o.is_verified });
    setError(null);
  }

  function cancelEdit() {
    setEditingDate(null);
  }

  async function saveEdit(date: string) {
    const finalHigh = Number(editDraft.finalHigh);
    if (!Number.isInteger(finalHigh)) {
      setError("Final high must be a whole number.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              date,
              final_high_f: finalHigh,
              source: editDraft.source.trim() || "WU",
              is_verified: editDraft.verified,
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      const saved: WuOutcome[] = json.outcomes;
      setOutcomes((prev) =>
        sortDesc(prev.map((o) => (o.date === date ? saved[0] : o)))
      );
      setEditingDate(null);
      setMessage(`Updated ${date}.`);
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* Batch entry */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink">Batch entry</h2>
          <p className="text-xs text-muted">
            Enter on the temp field adds a new row. Existing dates are corrected, not overwritten.
          </p>
        </div>

        <div className="overflow-x-auto rounded border border-panelBorder">
          <table className="w-full min-w-[560px] border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-panelBorder bg-panel text-left text-xs text-muted">
                <th className="px-3 py-2 font-normal">Date (PT)</th>
                <th className="px-3 py-2 font-normal">Final high (&deg;F)</th>
                <th className="px-3 py-2 font-normal">Source</th>
                <th className="px-3 py-2 font-normal">Verified</th>
                <th className="px-3 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className="border-b border-panelBorder/60 last:border-b-0">
                  <td className="px-3 py-1.5">
                    <input
                      ref={(el) => {
                        if (el) dateRefs.current.set(row.key, el);
                        else dateRefs.current.delete(row.key);
                      }}
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(row.key, "date", e.target.value)}
                      className="w-full rounded bg-void px-2 py-1 text-ink outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step={1}
                      inputMode="numeric"
                      placeholder="&deg;F"
                      value={row.finalHigh}
                      onChange={(e) => updateRow(row.key, "finalHigh", e.target.value)}
                      onKeyDown={(e) => handleTempKeyDown(e, index)}
                      className="w-24 rounded bg-void px-2 py-1 text-ink outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={row.source}
                      onChange={(e) => updateRow(row.key, "source", e.target.value)}
                      className="w-28 rounded bg-void px-2 py-1 text-ink outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={row.verified}
                      onChange={(e) => updateRow(row.key, "verified", e.target.checked)}
                      className="accent-accent"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-xs text-muted hover:text-danger"
                    >
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={addRow}
            className="rounded border border-panelBorder px-3 py-1.5 text-xs text-ink hover:border-accent"
          >
            + Add row
          </button>
          <button
            type="button"
            onClick={saveBatch}
            disabled={saving}
            className="rounded bg-accentDim px-4 py-1.5 text-xs font-medium text-white hover:bg-accent disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save batch"}
          </button>
          {message && <span className="text-xs text-accent">{message}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </section>

      {/* Existing entries */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink">Saved outcomes</h2>
          <p className="text-xs text-muted">{outcomes.length} entries</p>
        </div>

        {outcomes.length === 0 ? (
          <p className="text-xs text-muted">No outcomes saved yet.</p>
        ) : (
          <div className="max-h-[560px] overflow-y-auto overflow-x-auto rounded border border-panelBorder">
            <table className="w-full min-w-[640px] border-collapse font-mono text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-panelBorder bg-panel text-left text-xs text-muted">
                  <th className="px-3 py-2 font-normal">Date</th>
                  <th className="px-3 py-2 font-normal">Final high</th>
                  <th className="px-3 py-2 font-normal">Source</th>
                  <th className="px-3 py-2 font-normal">Verified</th>
                  <th className="px-3 py-2 font-normal">Corrections</th>
                  <th className="px-3 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => {
                  const isEditing = editingDate === o.date;
                  const isExpanded = expandedDate === o.date;
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-b border-panelBorder/60 bg-void/40">
                        <td className="px-3 py-1.5 text-ink">{o.date}</td>
                        <td className="px-3 py-1.5">
                          {isEditing ? (
                            <input
                              type="number"
                              step={1}
                              value={editDraft.finalHigh}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, finalHigh: e.target.value }))
                              }
                              className="w-20 rounded bg-void px-2 py-1 text-ink outline-none focus:ring-1 focus:ring-accent"
                            />
                          ) : (
                            <span className="text-ink">{o.final_high_f}&deg;F</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft.source}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, source: e.target.value }))
                              }
                              className="w-24 rounded bg-void px-2 py-1 text-ink outline-none focus:ring-1 focus:ring-accent"
                            />
                          ) : (
                            <span className="text-muted">{o.source}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditing ? (
                            <input
                              type="checkbox"
                              checked={editDraft.verified}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, verified: e.target.checked }))
                              }
                              className="accent-accent"
                            />
                          ) : o.is_verified ? (
                            <span className="text-accent">yes</span>
                          ) : (
                            <span className="text-warn">no</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {o.correction_history.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDate(isExpanded ? null : o.date)
                              }
                              className="text-xs text-warn hover:underline"
                            >
                              {o.correction_history.length} correction
                              {o.correction_history.length === 1 ? "" : "s"}
                            </button>
                          ) : (
                            <span className="text-xs text-muted">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {isEditing ? (
                            <span className="space-x-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(o.date)}
                                disabled={saving}
                                className="text-xs text-accent hover:underline"
                              >
                                save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="text-xs text-muted hover:underline"
                              >
                                cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(o)}
                              className="text-xs text-muted hover:text-accent"
                            >
                              edit
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-panelBorder/60 bg-void/70">
                          <td colSpan={6} className="px-3 py-2 text-xs text-muted">
                            <div className="space-y-1">
                              {o.correction_history
                                .slice()
                                .reverse()
                                .map((c, i) => (
                                  <div key={i}>
                                    was {c.previous_final_high_f}&deg;F ({c.previous_source}), entered{" "}
                                    {new Date(c.previous_entry_time).toLocaleString()} &mdash; corrected{" "}
                                    {new Date(c.changed_at).toLocaleString()}
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
