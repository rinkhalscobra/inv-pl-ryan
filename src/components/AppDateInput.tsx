import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { displayDateToIso, isoDateToDisplay } from "../utils/dateFormat";

interface AppDateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  min?: string;
  max?: string;
  "aria-label"?: string;
}

export default function AppDateInput({
  value,
  onChange,
  className = "",
  min,
  max,
  "aria-label": ariaLabel,
}: AppDateInputProps) {
  const [draft, setDraft] = useState(() => isoDateToDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(isoDateToDisplay(value)), [value]);

  const commit = (nextDraft: string) => {
    if (!nextDraft) {
      onChange("");
      return;
    }
    const iso = displayDateToIso(nextDraft);
    if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange(iso);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
          const next = [
            digits.slice(0, 2),
            digits.slice(2, 4),
            digits.slice(4, 8),
          ]
            .filter(Boolean)
            .join("/");
          setDraft(next);
          commit(next);
        }}
        onBlur={() => setDraft(isoDateToDisplay(value))}
        className="h-full w-full bg-transparent pr-10 outline-none placeholder:text-slate-600"
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onClick={() => pickerRef.current?.showPicker()}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-300 hover:text-white"
        aria-label={`${ariaLabel || "Date"} calendar`}
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
