"use client";

import { useState } from "react";

export function CopyButton({ label, getText, primary = false }: { label: string; getText: () => string; primary?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    const text = getText();
    if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(text); setStatus("copied"); return; }
      catch { /* Fall back when clipboard permissions are denied. */ }
    }
    // Public HTTP addresses need the selection-based copy command.
    const field = document.createElement("textarea");
    const focused = document.activeElement;
    field.value = text;
    field.readOnly = true;
    field.tabIndex = -1;
    field.style.cssText = "position: fixed; left: -9999px; top: 0";
    document.body.append(field);
    try {
      field.select();
      setStatus(document.execCommand("copy") ? "copied" : "failed");
    } catch { setStatus("failed"); }
    finally {
      field.remove();
      if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
    }
  }
  return <div className="copy-control"><button type="button" className={`button ${primary ? "primary" : "secondary"}`} onClick={copy} aria-live="polite">{status === "copied" ? "Copied ✓" : label}</button>{status === "failed" && <p className="small field-error" role="alert">Couldn’t copy. Please try again.</p>}</div>;
}
