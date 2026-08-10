import { ICONES_SUGERIDOS, iconeConta, isEmojiIcon } from "../utils/contaIcone";
import type { TipoConta } from "../types";

export function ContaIcone({
  icone,
  tipo,
  cor,
  size = "md",
}: {
  icone: string | null | undefined;
  tipo: TipoConta;
  cor: string;
  size?: "sm" | "md" | "lg";
}) {
  const valor = iconeConta(icone, tipo);
  const sizes = {
    sm: "h-8 w-8 text-base",
    md: "h-10 w-10 text-lg",
    lg: "h-12 w-12 text-xl",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-semibold ${sizes[size]} ${
        isEmojiIcon(valor) ? "text-lg" : "text-[10px] uppercase tracking-wide text-white"
      }`}
      style={{
        backgroundColor: isEmojiIcon(valor) ? cor + "25" : cor,
      }}
    >
      {isEmojiIcon(valor) ? valor : valor.slice(0, 3)}
    </span>
  );
}

export function IconeContaPicker({
  value,
  onChange,
  tipo,
}: {
  value: string;
  onChange: (v: string) => void;
  tipo: TipoConta;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">Ícone</label>
      <div className="flex flex-wrap gap-2">
        {ICONES_SUGERIDOS.map((item) => (
          <button
            key={item.icone + item.label}
            type="button"
            title={item.label}
            onClick={() => onChange(item.icone)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg transition-colors ${
              value === item.icone
                ? "border-cyan-400 bg-cyan-500/20 ring-2 ring-cyan-500/30"
                : "border-white/10 bg-white/5 hover:border-cyan-500/30"
            }`}
          >
            {item.icone}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Emoji ou sigla (padrão: ${iconeConta(null, tipo)})`}
        maxLength={8}
        className="app-input"
      />
      <p className="text-xs text-slate-500">
        Use um emoji ou até 3 letras (ex.: Nu, Itaú). Deixe vazio para usar o ícone padrão do tipo.
      </p>
    </div>
  );
}
