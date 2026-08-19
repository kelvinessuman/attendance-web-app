import React from "react";

interface SpinnerProps {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function Spinner({
  label = "Loading…",
  className = "",
  size = "md",
}: SpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`${sizeMap[size]} border-navy/30 border-t-navy rounded-full animate-spin`}
        aria-hidden
      />
      {label && (
        <p className="text-sm text-slate-500 font-medium">{label}</p>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
