import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { CUISINES, PRICE_LABELS, type ApiErrorBody, type OptionInput } from "@/lib/contracts";

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

export const emptyOption = (): OptionInput => ({ placeName: "", location: "", cuisine: "Other", priceLevel: 2, startTime: "12:30", link: "" });

export function OptionFields({ value, onChange, errors = {}, prefix = "" }: { value: OptionInput; onChange: (value: OptionInput) => void; errors?: Record<string, string[]>; prefix?: string }) {
  const set = (name: keyof OptionInput, next: string | number) => onChange({ ...value, [name]: next });
  return <div className="form-grid">
    <Field label="Place name" placeholder="e.g. Little Thai" required maxLength={120} value={value.placeName} onChange={(e) => set("placeName", e.target.value)} error={errors[`${prefix}placeName`]} />
    <Field label="Location" placeholder="Address or a familiar landmark" required maxLength={200} value={value.location} onChange={(e) => set("location", e.target.value)} error={errors[`${prefix}location`]} />
    <Field label="Start time" type="time" required value={value.startTime} onChange={(e) => set("startTime", e.target.value)} error={errors[`${prefix}startTime`]} />
    <Select label="Cuisine" value={value.cuisine} onChange={(e) => set("cuisine", e.target.value)} error={errors[`${prefix}cuisine`]}>{CUISINES.map((c) => <option key={c}>{c}</option>)}</Select>
    <Select label="Price per person" value={value.priceLevel} onChange={(e) => set("priceLevel", Number(e.target.value))} error={errors[`${prefix}priceLevel`]}>{[1, 2, 3].map((n) => <option key={n} value={n}>{"$".repeat(n)} · {PRICE_LABELS[n]}</option>)}</Select>
    <Field label="Place link (optional)" type="url" placeholder="https://…" maxLength={2048} value={value.link} onChange={(e) => set("link", e.target.value)} error={errors[`${prefix}link`]} />
  </div>;
}
