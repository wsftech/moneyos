import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

interface ValorInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "step"> {
  label?: string;
  error?: string;
  /** Layout compacto (ex.: célula de tabela) — sem label em bloco. */
  compact?: boolean;
}

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/** Avalia expressão aritmética simples (+ − * / e parênteses). */
function safeEval(expr: string): number | null {
  const cleaned = expr.replace(/,/g, ".").replace(/\s+/g, "");
  if (!cleaned || !/^[0-9+\-*/().]+$/.test(cleaned)) return null;
  try {
    // eslint-disable-next-line no-new-func -- expressão sanitizada acima
    const result = Function(`"use strict"; return (${cleaned})`)() as unknown;
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

const KEYS: { label: string; insert?: string; action?: "clear" | "back" | "eq"; wide?: boolean }[][] = [
  [
    { label: "C", action: "clear" },
    { label: "⌫", action: "back" },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
  ],
  [
    { label: "7", insert: "7" },
    { label: "8", insert: "8" },
    { label: "9", insert: "9" },
    { label: "÷", insert: "/" },
  ],
  [
    { label: "4", insert: "4" },
    { label: "5", insert: "5" },
    { label: "6", insert: "6" },
    { label: "×", insert: "*" },
  ],
  [
    { label: "1", insert: "1" },
    { label: "2", insert: "2" },
    { label: "3", insert: "3" },
    { label: "−", insert: "-" },
  ],
  [
    { label: "0", insert: "0", wide: true },
    { label: ",", insert: "." },
    { label: "+", insert: "+" },
  ],
  [{ label: "=", action: "eq", wide: true }],
];

function CalculatorIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8" />
      <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

export function ValorInput({
  label,
  error,
  className = "",
  id,
  compact = false,
  value,
  onChange,
  disabled,
  ...props
}: ValorInputProps) {
  const autoId = useId();
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s/g, "-") : autoId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");

  const emitValue = useCallback(
    (next: string) => {
      if (!onChange) return;
      const event = {
        target: { value: next },
        currentTarget: { value: next },
      } as ChangeEvent<HTMLInputElement>;
      onChange(event);
    },
    [onChange],
  );

  const applyExpr = useCallback(() => {
    const result = safeEval(expr);
    if (result == null) return;
    const formatted = formatResult(result);
    emitValue(formatted);
    setExpr(formatted);
    setOpen(false);
  }, [emitValue, expr]);

  useEffect(() => {
    if (!open) return;
    const current = value == null ? "" : String(value);
    setExpr(current);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function handleKey(key: (typeof KEYS)[number][number]) {
    if (key.action === "clear") {
      setExpr("");
      return;
    }
    if (key.action === "back") {
      setExpr((s) => s.slice(0, -1));
      return;
    }
    if (key.action === "eq") {
      applyExpr();
      return;
    }
    if (key.insert != null) {
      setExpr((s) => s + key.insert);
    }
  }

  function onExprKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyExpr();
    }
  }

  const inputEl = (
    <div className="relative flex items-stretch gap-1.5">
      <input
        id={inputId}
        type="number"
        step="0.01"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onChange={onChange}
        className={`app-input min-w-0 flex-1 ${error ? "border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20" : ""} ${className}`}
        {...props}
      />
      <button
        type="button"
        disabled={disabled}
        title="Calculadora"
        aria-label="Abrir calculadora"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 ${
          compact ? "h-8 w-8" : "w-11"
        } ${open ? "border-slate-300 bg-slate-50 text-slate-900" : ""}`}
      >
        <CalculatorIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[220px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/80 ${
            compact ? "right-0 top-full mt-1" : "right-0 top-[calc(100%+6px)]"
          }`}
          role="dialog"
          aria-label="Calculadora"
        >
          <input
            type="text"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={onExprKeyDown}
            className="app-input mb-2 w-full text-right font-mono text-sm"
            inputMode="decimal"
            autoFocus
            aria-label="Expressão"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {KEYS.flat().map((key) => (
              <button
                key={key.label + (key.insert ?? key.action)}
                type="button"
                onClick={() => handleKey(key)}
                className={`rounded-lg px-0 py-2 text-sm font-medium transition-colors ${
                  key.action === "eq"
                    ? "col-span-4 bg-app-sidebar text-white hover:bg-[#0f3344]"
                    : key.action === "clear" || key.action === "back"
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : key.insert && "+-*/".includes(key.insert)
                        ? "bg-slate-50 text-slate-800 hover:bg-slate-100"
                        : "bg-slate-50 text-slate-800 hover:bg-white hover:ring-1 hover:ring-slate-200"
                } ${key.wide && key.action !== "eq" ? "col-span-2" : ""}`}
              >
                {key.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-400">
            Digite uma conta (ex.: 1200+350*2) e pressione = para preencher o campo.
          </p>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div ref={wrapRef} className="relative inline-flex">
        {inputEl}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative space-y-1">
      {label && (
        <label htmlFor={inputId} className="app-label">
          {label}
        </label>
      )}
      {inputEl}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
