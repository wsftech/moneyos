import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary:
    "bg-app-sidebar text-white shadow-sm shadow-slate-300/50 hover:bg-[#0f3344]",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
  danger:
    "bg-rose-600 text-white shadow-sm shadow-rose-200 hover:bg-rose-500",
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
};

type Variant = keyof typeof variants;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
