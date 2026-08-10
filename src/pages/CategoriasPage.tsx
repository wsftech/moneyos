import { useCallback, useEffect, useMemo, useState } from "react";
import { ContextoBadge } from "../components/ContextoSelector";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorAlert, LoadingSpinner } from "../components/ui/Feedback";
import { Input, Select } from "../components/ui/FormFields";
import { Modal } from "../components/ui/Modal";
import { useContexto } from "../contexts/ContextoContext";
import {
  createCategoria,
  deleteCategoria,
  listCategorias,
  updateCategoria,
  type CategoriaInput,
} from "../db/categorias";
import {
  importarTemplateCategorias,
  listTemplatesDisponiveis,
  type TemplateCategoriaGrupo,
} from "../db/categoriaTemplates";
import { getErrorMessage } from "../db/utils";
import type { Categoria, ContextoCategoria, ContextoVisualizacao, TipoCategoria } from "../types";
import { THEME } from "../utils/theme";

const NATUREZA_OPTIONS: { value: TipoCategoria; label: string; descricao: string }[] = [
  {
    value: "receita",
    label: "Ativo",
    descricao: "Entradas, receitas e recursos que aumentam o patrimônio",
  },
  {
    value: "despesa",
    label: "Passivo",
    descricao: "Saídas, despesas e obrigações financeiras",
  },
];

const CORES_ATIVO = ["#6366f1", "#818cf8", "#34d399", "#06b6d4", "#fbbf24", "#a78bfa"];
const CORES_PASSIVO = ["#ff2d55", "#fb7185", "#f97316", "#ef4444", "#ec4899", "#8b5cf6"];

export function CategoriasPage() {
  const { contexto, loading: ctxLoading } = useContexto();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [tipoInicial, setTipoInicial] = useState<TipoCategoria>("receita");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategorias(await listCategorias(contexto));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [contexto]);

  useEffect(() => {
    if (!ctxLoading) void carregar();
  }, [carregar, ctxLoading]);

  const ativos = useMemo(() => categorias.filter((c) => c.tipo === "receita"), [categorias]);
  const passivos = useMemo(() => categorias.filter((c) => c.tipo === "despesa"), [categorias]);

  function abrirModal(tipo: TipoCategoria, categoria?: Categoria) {
    setEditing(categoria ?? null);
    setTipoInicial(categoria?.tipo ?? tipo);
    setModalOpen(true);
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir esta categoria?")) return;
    try {
      await deleteCategoria(id);
      await carregar();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleImportarTemplate(grupo: TemplateCategoriaGrupo) {
    try {
      const res = await importarTemplateCategorias(grupo, contexto);
      await carregar();
      if (res.criadas > 0) {
        setError(null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {listTemplatesDisponiveis().map((t) => (
          <Button key={t.id} variant="secondary" onClick={() => void handleImportarTemplate(t.id)}>
            Importar {t.label}
          </Button>
        ))}
      </div>
      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      {loading || ctxLoading ? (
        <LoadingSpinner />
      ) : categorias.length === 0 ? (
        <EmptyState message="Nenhuma categoria cadastrada." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <CategoriaSecao
            titulo="Ativos"
            subtitulo="Receitas e entradas"
            accent={THEME.income}
            categorias={ativos}
            contexto={contexto}
            onNova={() => abrirModal("receita")}
            onEditar={(c) => abrirModal("receita", c)}
            onExcluir={(id) => void handleDelete(id)}
          />
          <CategoriaSecao
            titulo="Passivos"
            subtitulo="Despesas e obrigações"
            accent={THEME.expense}
            categorias={passivos}
            contexto={contexto}
            onNova={() => abrirModal("despesa")}
            onEditar={(c) => abrirModal("despesa", c)}
            onExcluir={(id) => void handleDelete(id)}
          />
        </div>
      )}

      {categorias.length === 0 && !loading && !ctxLoading && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => abrirModal("receita")}>+ Ativo</Button>
          <Button variant="secondary" onClick={() => abrirModal("despesa")}>
            + Passivo
          </Button>
        </div>
      )}

      <CategoriaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        categoria={editing}
        tipoInicial={tipoInicial}
        onSaved={() => {
          setModalOpen(false);
          void carregar();
        }}
      />
    </div>
  );
}

function CategoriaSecao({
  titulo,
  subtitulo,
  accent,
  categorias,
  contexto,
  onNova,
  onEditar,
  onExcluir,
}: {
  titulo: string;
  subtitulo: string;
  accent: string;
  categorias: Categoria[];
  contexto: ContextoVisualizacao;
  onNova: () => void;
  onEditar: (c: Categoria) => void;
  onExcluir: (id: number) => void;
}) {
  return (
    <section
      className="app-card overflow-hidden"
      style={{ boxShadow: `0 4px 24px ${accent}12` }}
    >
      <div
        className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${accent}12 0%, transparent 100%)` }}
      >
        <div>
          <h2 className="font-semibold text-white">{titulo}</h2>
          <p className="text-xs text-slate-500">{subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${accent}20`, color: accent }}
          >
            {categorias.length}
          </span>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onNova}>
            + Nova
          </Button>
        </div>
      </div>

      {categorias.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          Nenhuma categoria de {titulo.toLowerCase()}.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {categorias.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ backgroundColor: cat.cor + "25", color: cat.cor }}
                >
                  {cat.icone ?? (cat.tipo === "receita" ? "↑" : "↓")}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{cat.nome}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {contexto === "consolidado" && cat.contexto !== "ambos" && (
                      <ContextoBadge itemContexto={cat.contexto} />
                    )}
                    {cat.contexto === "ambos" && (
                      <span className="text-xs text-slate-500">Pessoal · Empresa</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" className="px-2 py-1" onClick={() => onEditar(cat)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-rose-400"
                  onClick={() => onExcluir(cat.id)}
                >
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoriaModal({
  open,
  onClose,
  categoria,
  tipoInicial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  categoria: Categoria | null;
  tipoInicial: TipoCategoria;
  onSaved: () => void;
}) {
  const { contexto } = useContexto();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoCategoria>("receita");
  const [catContexto, setCatContexto] = useState<ContextoCategoria>("pessoal");
  const [cor, setCor] = useState(CORES_ATIVO[0]);
  const [icone, setIcone] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cores = tipo === "receita" ? CORES_ATIVO : CORES_PASSIVO;

  useEffect(() => {
    if (categoria) {
      setNome(categoria.nome);
      setTipo(categoria.tipo);
      setCatContexto(categoria.contexto);
      setCor(categoria.cor);
      setIcone(categoria.icone ?? "");
    } else {
      setNome("");
      setTipo(tipoInicial);
      setCatContexto(contexto === "consolidado" ? "ambos" : contexto);
      setCor(tipoInicial === "receita" ? CORES_ATIVO[0] : CORES_PASSIVO[0]);
      setIcone("");
    }
  }, [categoria, open, contexto, tipoInicial]);

  useEffect(() => {
    if (!categoria && open) {
      setCor(tipo === "receita" ? CORES_ATIVO[0] : CORES_PASSIVO[0]);
    }
  }, [tipo, categoria, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nome) {
      setFormError("Informe o nome da categoria.");
      return;
    }

    let ctx: ContextoCategoria = catContexto;
    if (contexto !== "consolidado") {
      ctx = contexto;
    }

    const input: CategoriaInput = {
      nome,
      tipo,
      contexto: ctx,
      cor,
      icone: icone || null,
    };

    setSaving(true);
    try {
      if (categoria) {
        await updateCategoria(categoria.id, input);
      } else {
        await createCategoria(input);
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const naturezaAtual = NATUREZA_OPTIONS.find((n) => n.value === tipo);

  return (
    <Modal open={open} onClose={onClose} title={categoria ? "Editar categoria" : "Nova categoria"}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}

        <div className="grid grid-cols-2 gap-2">
          {NATUREZA_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTipo(opt.value)}
              className={`rounded-xl border p-3 text-left transition-all ${
                tipo === opt.value
                  ? opt.value === "receita"
                    ? "border-indigo-500/40 bg-indigo-500/15 ring-1 ring-indigo-500/30"
                    : "border-[#ff2d55]/40 bg-[#ff2d55]/10 ring-1 ring-[#ff2d55]/30"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <span className="text-sm font-semibold text-white">{opt.label}</span>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{opt.descricao}</p>
            </button>
          ))}
        </div>

        {naturezaAtual && (
          <p className="text-xs text-slate-500">
            Registrado como <strong className="text-slate-400">{naturezaAtual.value}</strong> nas
            transações.
          </p>
        )}

        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />

        {contexto === "consolidado" && (
          <Select
            label="Contexto"
            value={catContexto}
            onChange={(e) => setCatContexto(e.target.value as ContextoCategoria)}
            options={[
              { value: "pessoal", label: "Pessoal" },
              { value: "empresa", label: "Empresa" },
              { value: "ambos", label: "Ambos" },
            ]}
          />
        )}

        <Input label="Ícone (emoji opcional)" value={icone} onChange={(e) => setIcone(e.target.value)} />

        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Cor</p>
          <div className="flex flex-wrap gap-2">
            {cores.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={`h-8 w-8 rounded-full border-2 ${cor === c ? "border-white" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
