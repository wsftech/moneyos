import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary:
    "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-500",
  secondary:
    "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:border-white/25",
  danger:
    "bg-gradient-to-r from-[#ff2d55] to-pink-600 text-white shadow-lg shadow-[#ff2d55]/25 hover:from-[#ff4d6d] hover:to-pink-500",
  ghost: "text-slate-400 hover:bg-white/5 hover:text-slate-200",
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
