import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { CUISINES, PRICE_LABELS, type ApiErrorBody, type OptionInput, type SavedPreferences } from "@/lib/contracts";

export function Field({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string[]; hint?: string }) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <input {...props} id={id} aria-invalid={error?.length ? true : undefined} aria-describedby={error || hint ? `${id}-help` : undefined} />
    {error ? <span id={`${id}-help`} className="field-error">{error.join(" ")}</span> : hint ? <span id={`${id}-help`} className="hint">{hint}</span> : null}
  </div>;
}

export function Select({ label, children, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode; error?: string[] }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><select {...props} id={id} aria-invalid={error?.length ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>{children}</select>{error && <span id={`${id}-error`} className="field-error">{error.join(" ")}</span>}</div>;
}

export function FormError({ error }: { error: ApiErrorBody | null }) {
  return error ? <p className="error-box" role="alert">{error.message}</p> : null;
}

export function CuisineBudgetFields({ value, onChange }: { value: SavedPreferences; onChange: (value: SavedPreferences) => void }) {
  return <div className="cuisine-budget-fields"><fieldset className="cuisine-picker"><legend>Cuisines you like</legend><div className="chips">{CUISINES.map((cuisine) => <label key={cuisine} className={value.cuisines.includes(cuisine) ? "chip checked" : "chip"}><input type="checkbox" checked={value.cuisines.includes(cuisine)} onChange={(event) => onChange({ ...value, cuisines: event.target.checked ? [...value.cuisines, cuisine] : value.cuisines.filter((item) => item !== cuisine) })} />{cuisine}</label>)}</div></fieldset><Select label="Preferred price ceiling" value={value.maxPriceLevel ?? ""} onChange={(event) => onChange({ ...value, maxPriceLevel: event.target.value ? Number(event.target.value) : null })}><option value="">Any price</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{"$".repeat(n)} · {PRICE_LABELS[n]}</option>)}</Select></div>;
}

export const emptyOption = (): OptionInput => ({ placeName: "", location: "", cuisine: null, priceLevel: null, startTime: "12:30", link: "" });

export function OptionFields({ value, onChange, errors = {}, prefix = "" }: { value: OptionInput; onChange: (value: OptionInput) => void; errors?: Record<string, string[]>; prefix?: string }) {
  const set = (name: keyof OptionInput, next: string | number | null) => onChange({ ...value, [name]: next });
  return <><div className="form-grid">
    <Field label="Place name" placeholder="e.g. Little Thai" required maxLength={120} value={value.placeName} onChange={(e) => set("placeName", e.target.value)} error={errors[`${prefix}placeName`]} />
    <Field label="Start time" type="time" required value={value.startTime} onChange={(e) => set("startTime", e.target.value)} error={errors[`${prefix}startTime`]} />
  </div><details className="optional-details" open={["location", "cuisine", "priceLevel", "link"].some((field) => errors[`${prefix}${field}`]) ? true : undefined} onInvalidCapture={(event) => { event.currentTarget.open = true; }}><summary>Restaurant details (optional)</summary><div className="form-grid">
    <Field label="Location" placeholder="Address or a familiar landmark" maxLength={200} value={value.location} onChange={(e) => set("location", e.target.value)} error={errors[`${prefix}location`]} />
    <Select label="Cuisine" value={value.cuisine ?? ""} onChange={(e) => set("cuisine", e.target.value || null)} error={errors[`${prefix}cuisine`]}><option value="">Not specified</option>{CUISINES.map((c) => <option key={c}>{c}</option>)}</Select>
    <Select label="Price per person" value={value.priceLevel ?? ""} onChange={(e) => set("priceLevel", e.target.value ? Number(e.target.value) : null)} error={errors[`${prefix}priceLevel`]}><option value="">Not specified</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{"$".repeat(n)} · {PRICE_LABELS[n]}</option>)}</Select>
    <Field label="Place link (optional)" type="url" placeholder="https://…" maxLength={2048} value={value.link} onChange={(e) => set("link", e.target.value)} error={errors[`${prefix}link`]} />
  </div><p className="hint">Add what you know. Unspecified cuisine and price won’t count as preference matches.</p></details></>;
}
