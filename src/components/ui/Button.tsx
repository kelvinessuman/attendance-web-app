import React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "amber";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-navy text-white hover:bg-navy/90 focus-visible:ring-navy disabled:bg-slate-400",
  secondary:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400 disabled:bg-slate-100 disabled:text-slate-400",
  danger:
    "bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-400 disabled:opacity-50",
  ghost:
    "bg-transparent text-navy hover:bg-navy/5 focus-visible:ring-navy disabled:opacity-50",
  amber:
    "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500 disabled:bg-amber-300",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-lg gap-1",
  md: "px-4 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-6 py-3 text-sm font-semibold rounded-xl gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center font-medium transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
