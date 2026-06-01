import React, { useState } from 'react'

const SEGMENT_COLS = ["Diagnostic","Model","Control","Pilot combined","Pilot group - no SW","Pilot group - SW","Top agent","Top agent - SW"]
const METRICS = ["Volume","Attempt","Saves"]
const SEG_DISPLAY = { "Top agent": "Top agents - Overall" }
const dn = s => SEG_DISPLAY[s] || s

const DEFAULT_ROWS = [
  { "Cancellation Reason": "Price sensitive", "Metric": "Volume" },
  { "Cancellation Reason": "Price sensitive", "Metric": "Attempt" },
  { "Cancellation Reason": "Price sensitive", "Metric": "Saves" },
  { "Cancellation Reason": "Service Dissatisfaction", "Metric": "Volume" },
  { "Cancellation Reason": "Service Dissatisfaction", "Metric": "Attempt" },
  { "Cancellation Reason": "Service Dissatisfaction", "Metric": "Saves" },
  { "Cancellation Reason": "Moving", "Metric": "Volume" },
  { "Cancellation Reason": "Moving", "Metric": "Attempt" },
  { "Cancellation Reason": "Moving", "Metric": "Saves" },
  { "Cancellation Reason": "Other", "Metric": "Volume" },
  { "Cancellation Reason": "Other", "Metric": "Attempt" },
  { "Cancellation Reason": "Other", "Metric": "Saves" },
].map(r => { const row = {...r}; SEGMENT_COLS.forEach(s => { row[s] = "" }); return row })

export default function DataEditor({ rows, onChange }) {
  const [newCat, setNewCat] = useState("")
  const workingRows = rows.length ? rows : DEFAULT_ROWS

  const cats = [...new Set(workingRows.map(r => r["Cancellation Reason"]).filter(Boolean))]

  function updateCell(rowIdx, col, val) {
    const updated = workingRows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r)
    onChange(updated)
  }

  function addCategory() {
    if (!newCat.trim()) return
    const newRows = METRICS.map(m => {
      const row = { "Cancellation Reason": newCat.trim(), "Metric": m }
      SEGMENT_COLS.forEach(s => { row[s] = "" })
      return row
    })
    onChange([...workingRows, ...newRows])
    setNewCat("")
  }

  function removeCategory(cat) {
    onChange(workingRows.filter(r => r["Cancellation Reason"] !== cat))
  }

  const thStyle = { padding: "8px 10px", fontSize: 11, fontWeight: 600, textAlign: "right",
    whiteSpace: "nowrap", background: "#f5f5f5", borderBottom: "1px solid #e0e0e0",
    borderRight: "0.5px solid #e8e8e8", color: "#555", textTransform: "uppercase", letterSpacing: "0.03em" }
  const tdLabelStyle = { padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap",
    borderBottom: "0.5px solid #f0f0f0", borderRight: "0.5px solid #e8e8e8",
    background: "#fafafa", color: "#666" }
  const tdCatStyle = { padding: "6px 10px", fontSize: 12, fontWeight: 500,
    whiteSpace: "nowrap", borderBottom: "0.5px solid #f0f0f0",
    borderRight: "0.5px solid #e8e8e8", background: "#fff" }

  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Data Editor</h2>
          <p style={{ fontSize: 12, color: "#888", marginTop: 3 }}>Edit values directly. Changes update the dashboard instantly.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCategory()}
            placeholder="New cancellation reason…"
            style={{ fontSize: 12, padding: "5px 10px", border: "0.5px solid #ccc", borderRadius: 6, width: 220 }} />
          <button onClick={addCategory}
            style={{ fontSize: 12, padding: "5px 12px", border: "0.5px solid #ccc", borderRadius: 6, cursor: "pointer", background: "#fff" }}>
            + Add
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Cancellation Reason</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 80 }}>Metric</th>
              {SEGMENT_COLS.map(s => (
                <th key={s} style={{ ...thStyle, minWidth: 90 }}>{dn(s)}</th>
              ))}
              <th style={{ ...thStyle, minWidth: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {cats.map(cat => {
              const catRows = workingRows.map((r, i) => ({ ...r, _idx: i })).filter(r => r["Cancellation Reason"] === cat)
              return catRows.map((row, ri) => (
                <tr key={row._idx} style={{ background: ri % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {ri === 0
                    ? <td rowSpan={catRows.length} style={{ ...tdCatStyle, verticalAlign: "middle", borderBottom: "1px solid #e0e0e0" }}>
                        {cat}
                      </td>
                    : null}
                  <td style={tdLabelStyle}>{row["Metric"]}</td>
                  {SEGMENT_COLS.map(seg => (
                    <td key={seg} style={{ padding: 0, borderBottom: "0.5px solid #f0f0f0", borderRight: "0.5px solid #e8e8e8" }}>
                      <input
                        type="number"
                        value={row[seg] ?? ""}
                        onChange={e => updateCell(row._idx, seg, e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", border: "none", outline: "none",
                          background: "transparent", fontSize: 12, textAlign: "right",
                          color: "#1a1a1a" }}
                      />
                    </td>
                  ))}
                  {ri === 0
                    ? <td rowSpan={catRows.length} style={{ ...tdLabelStyle, textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid #e0e0e0" }}>
                        <button onClick={() => removeCategory(cat)}
                          style={{ fontSize: 11, color: "#C0392B", background: "none", border: "none", cursor: "pointer" }}>
                          ✕
                        </button>
                      </td>
                    : null}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
