import React from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

type AlertVariant = "error" | "success" | "info" | "warning";

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
}

const styles: Record<
  AlertVariant,
  { box: string; icon: React.ReactNode }
> = {
  error: {
    box: "bg-red-50 border-red-200 text-red-800",
    icon: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />,
  },
  success: {
    box: "bg-green-50 border-green-200 text-green-800",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />,
  },
  info: {
    box: "bg-sky-50 border-sky-200 text-sky-800",
    icon: <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />,
  },
  warning: {
    box: "bg-amber-50 border-amber-200 text-amber-900",
    icon: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />,
  },
};

export function Alert({
  variant = "info",
  children,
  className = "",
  onDismiss,
}: AlertProps) {
  const s = styles[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={[
        "rounded-xl border p-3 flex items-start gap-2.5 text-sm",
        s.box,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {s.icon}
      <div className="flex-1 min-w-0">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-current/60 hover:text-current text-xs font-medium shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

