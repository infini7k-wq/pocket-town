"use client";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  title,
  icon,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  icon?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cx("rounded-2xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-900/5", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            {icon && <span aria-hidden>{icon}</span>}
            {title}
          </h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "go";

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  className,
  title,
  type = "button",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50",
    go: "bg-gradient-to-b from-orange-400 to-orange-500 text-white shadow-md shadow-orange-500/30 hover:from-orange-500 hover:to-orange-600",
  };
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, className, color = "bg-blue-500" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cx("h-2 overflow-hidden rounded-full bg-slate-200", className)}>
      <div className={cx("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** 符号つきの数値（プラスは緑、マイナスは赤） */
export function Signed({ value, children, className }: { value: number; children: React.ReactNode; className?: string }) {
  return <span className={cx("tabular font-bold", value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-slate-500", className)}>{children}</span>;
}

export function Modal({ children, label, onClose }: { children: React.ReactNode; label: string; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div className="animate-sheet-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
