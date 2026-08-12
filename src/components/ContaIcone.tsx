import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BANCOS_PRESETS,
  ICONES_SUGERIDOS,
  iconeConta,
  isEmojiIcon,
  type BancoPreset,
} from "../utils/contaIcone";
import { resolverLogoPreview } from "../db/logosConta";
import { getErrorMessage } from "../db/utils";
import type { TipoConta } from "../types";
import { Button } from "./ui/Button";

const LOGO_FILTERS = [
  {
    name: "Imagens",
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
  },
];

export function ContaIcone({
  icone,
  logoPath,
  tipo,
  cor,
  size = "md",
}: {
  icone: string | null | undefined;
  logoPath?: string | null;
  tipo: TipoConta;
  cor: string;
  size?: "sm" | "md" | "lg";
}) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const valor = iconeConta(icone, tipo);
  const sizes = {
    sm: "h-8 w-8 text-base",
    md: "h-10 w-10 text-lg",
    lg: "h-12 w-12 text-xl",
  };

  useEffect(() => {
    let cancelled = false;
    setLogoSrc(null);
    void resolverLogoPreview(logoPath).then((src) => {
      if (!cancelled) setLogoSrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  if (logoSrc) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 ${sizes[size]}`}
      >
        <img src={logoSrc} alt="" className="h-full w-full object-contain p-1" />
      </span>
    );
  }

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

type PickerProps = {
  value: string;
  onChange: (v: string) => void;
  tipo: TipoConta;
  logoPath: string | null;
  pendingLogoSource: string | null;
  onLogoPathChange: (path: string | null) => void;
  onPendingLogoSourceChange: (path: string | null) => void;
  onBancoPreset?: (preset: BancoPreset) => void;
  previewCor: string;
};

export function IconeContaPicker({
  value,
  onChange,
  tipo,
  logoPath,
  pendingLogoSource,
  onLogoPathChange,
  onPendingLogoSourceChange,
  onBancoPreset,
  previewCor,
}: PickerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewPath = pendingLogoSource ?? logoPath;

  async function handleSelecionarLogo() {
    setError(null);
    if (!isTauri()) {
      setError("Upload de logo disponível apenas no app desktop.");
      return;
    }
    try {
      const selected = await open({
        title: "Selecionar logo do banco",
        filters: LOGO_FILTERS,
        multiple: false,
      });
      if (!selected || typeof selected !== "string") return;
      setLoading(true);
      onPendingLogoSourceChange(selected);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleRemoverLogo() {
    onPendingLogoSourceChange(null);
    onLogoPathChange(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ContaIcone
          icone={value || null}
          logoPath={previewPath}
          tipo={tipo}
          cor={previewCor}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700">Ícone ou logo</p>
          <p className="text-xs text-slate-500">
            Use um preset de banco, emoji/sigla ou envie o logo oficial.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Bancos sugeridos
        </p>
        <div className="flex flex-wrap gap-2">
          {BANCOS_PRESETS.map((banco) => (
            <button
              key={banco.id}
              type="button"
              title={banco.nome}
              onClick={() => {
                onChange(banco.sigla);
                onBancoPreset?.(banco);
              }}
              className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                value === banco.sigla && !previewPath
                  ? "border-teal-500 bg-teal-50 text-teal-900 ring-1 ring-teal-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-bold text-white"
                style={{ backgroundColor: banco.cor }}
              >
                {banco.sigla.slice(0, 3)}
              </span>
              {banco.nome}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Emojis</p>
        <div className="flex flex-wrap gap-2">
          {ICONES_SUGERIDOS.map((item) => (
            <button
              key={item.icone + item.label}
              type="button"
              title={item.label}
              onClick={() => {
                onChange(item.icone);
                handleRemoverLogo();
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg transition-colors ${
                value === item.icone && !previewPath
                  ? "border-teal-500 bg-teal-50 ring-2 ring-teal-200"
                  : "border-slate-200 bg-slate-50 hover:border-teal-300"
              }`}
            >
              {item.icone}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="app-label mb-1">Sigla ou emoji</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Ex.: SAN, Nu, ITA (padrão: ${iconeConta(null, tipo)})`}
          maxLength={8}
          className="app-input"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            disabled={loading}
            onClick={() => void handleSelecionarLogo()}
          >
            {loading ? "Abrindo…" : previewPath ? "Trocar logo" : "Enviar logo"}
          </Button>
          {previewPath && (
            <Button type="button" variant="ghost" className="text-xs" onClick={handleRemoverLogo}>
              Remover logo
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          PNG, JPG, WEBP, GIF ou SVG · máx. 2 MB. O logo tem prioridade sobre a sigla/emoji.
        </p>
        {pendingLogoSource && (
          <p className="mt-1 truncate text-xs text-teal-700">
            Novo arquivo selecionado — será salvo ao confirmar a conta.
          </p>
        )}
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
