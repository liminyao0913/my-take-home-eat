"use client";

import { useState } from "react";

export function CopyButton({ label, getText, primary = false }: { label: string; getText: () => string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  async function copy() {
    const text = getText();
    try { await navigator.clipboard.writeText(text); setCopied(true); setFallback(""); }
    catch { setFallback(text); }
  }
  return <div className="copy-control"><button type="button" className={`button ${primary ? "primary" : "secondary"}`} onClick={copy}>{copied ? "Copied ✓" : label}</button>{fallback && <label className="copy-fallback">Select and copy<textarea readOnly value={fallback} onFocus={(e) => e.target.select()} /></label>}</div>;
}
