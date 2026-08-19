import React, { useId } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({
  label,
  hint,
  error,
  id,
  className = "",
  ...props
}: InputProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5"
      >
        {label}
        {props.required && (
          <span className="text-red-500 ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={[
          "block w-full border rounded-xl px-3 py-2.5 text-sm text-slate-800",
          "placeholder:text-slate-400",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:border-navy",
          "disabled:bg-slate-50 disabled:text-slate-500",
          error
            ? "border-red-300 focus-visible:ring-red-400"
            : "border-slate-200",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
