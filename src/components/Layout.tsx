import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppLogo, useNomeUsuario } from "./AppBrand";
import { ContextoSelector } from "./ContextoSelector";
import { IconChevronLeft, IconChevronRight, NAV_ICONS } from "./NavIcons";
import { Button } from "./ui/Button";
import { useContexto } from "../contexts/ContextoContext";
import { contarAlertasOrcamento } from "../db/alertasOrcamento";
import { contarVencimentosAtrasados } from "../db/proximosVencimentos";
import { verificarLembretesVencimento } from "../services/lembretesVencimento";

const SIDEBAR_STORAGE_KEY = "moneyos_sidebar_expanded";

const NAV_GROUPS = [
  {
    id: "principal",
    label: null as string | null,
    items: [
      { to: "/", label: "Dashboard", end: true, icon: "dashboard" as const },
      {
        to: "/transacoes",
        label: "Transações",
        icon: "transacoes" as const,
        match: "lancamentos" as const,
      },
      { to: "/contas", label: "Contas", icon: "contas" as const },
    ],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    items: [
      { to: "/metas", label: "Metas", icon: "metas" as const },
      { to: "/orcamentos", label: "Orçamentos", icon: "orcamentos" as const, badgeKey: "orcamentos" as const },
      { to: "/relatorios", label: "Relatórios", icon: "relatorios" as const },
      { to: "/categorias", label: "Categorias", icon: "categorias" as const },
      {
        to: "/transacoes?aba=recorrentes",
        label: "Recorrentes",
        icon: "recorrentes" as const,
        match: "recorrentes" as const,
      },
      {
        to: "/contas-pagar-receber",
        label: "A pagar/receber",
        icon: "pagarReceber" as const,
        badgeKey: "vencimentos" as const,
      },
      { to: "/dividas-parceladas", label: "Dívidas parceladas", icon: "financiamentos" as const },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { to: "/aprender", label: "Aprender", icon: "aprender" as const },
      { to: "/configuracoes", label: "Configurações", icon: "configuracoes" as const },
    ],
  },
] as const;

function readExpandedPreference(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function iniciaisUsuario(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "U";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0] ?? ""}${partes[partes.length - 1][0] ?? ""}`.toUpperCase();
}

function NovoLancamentoMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        className="py-1.5 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + Novo lançamento
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/80"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go("/transacoes?nova=1")}
          >
            Receita ou despesa
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go("/transacoes?nova=1&tipo=transferencia")}
          >
            Transferência
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go("/contas-pagar-receber?nova=1")}
          >
            Agendar a pagar/receber
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go("/dividas-parceladas?nova=1")}
          >
            Dívida parcelada
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { label: contextoLabel, contexto } = useContexto();
  const { nome: nomeUsuario } = useNomeUsuario();
  const location = useLocation();
  const [expanded, setExpanded] = useState(readExpandedPreference);
  const [alertasOrcamento, setAlertasOrcamento] = useState(0);
  const [vencimentosAtrasados, setVencimentosAtrasados] = useState(0);

  const abaTransacoes = new URLSearchParams(location.search).get("aba");
  const emRecorrentes =
    location.pathname === "/transacoes" && abaTransacoes === "recorrentes";

  useEffect(() => {
    void contarAlertasOrcamento(contexto).then(setAlertasOrcamento);
    void contarVencimentosAtrasados(contexto).then(setVencimentosAtrasados);
    void verificarLembretesVencimento(contexto);
    const interval = window.setInterval(() => {
      void verificarLembretesVencimento(contexto);
      void contarVencimentosAtrasados(contexto).then(setVencimentosAtrasados);
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [contexto]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg">
      <aside
        className={`flex h-full shrink-0 flex-col bg-app-sidebar text-slate-300 transition-[width] duration-300 ease-in-out ${
          expanded ? "w-60" : "w-[4.25rem]"
        }`}
      >
        <div className={`border-b border-white/10 ${expanded ? "px-4 py-5" : "px-2 py-4"}`}>
          <div className={`flex items-center ${expanded ? "" : "justify-center"}`}>
            {expanded ? (
              <AppLogo variant="logo" className="h-8 w-auto max-w-full" title="WSF Money" />
            ) : (
              <AppLogo variant="icon" className="h-10 w-10" title="WSF Money" />
            )}
          </div>
          <span className="sr-only">WSF Money</span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {expanded && group.label && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  const badge =
                    "badgeKey" in item && item.badgeKey === "orcamentos" && alertasOrcamento > 0
                      ? alertasOrcamento
                      : "badgeKey" in item &&
                          item.badgeKey === "vencimentos" &&
                          vencimentosAtrasados > 0
                        ? vencimentosAtrasados
                        : null;
                  const match = "match" in item ? item.match : undefined;
                  return (
                    <NavLink
                      key={item.to + item.label}
                      to={item.to}
                      end={"end" in item ? item.end : undefined}
                      title={expanded ? undefined : item.label}
                      className={({ isActive }) => {
                        let active = isActive;
                        if (match === "recorrentes") active = emRecorrentes;
                        else if (match === "lancamentos") {
                          active =
                            location.pathname === "/transacoes" && !emRecorrentes;
                        } else if (item.to.startsWith("/configuracoes")) {
                          active = location.pathname.startsWith("/configuracoes");
                        }
                        return `relative flex items-center rounded-xl text-sm font-medium transition-all ${
                          expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5"
                        } ${
                          active
                            ? "app-nav-active"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                        }`;
                      }}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {expanded && <span className="truncate">{item.label}</span>}
                      {badge != null && (
                        <span
                          className={`absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ${
                            expanded ? "right-2 top-2" : "right-0 top-0"
                          }`}
                        >
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10">
          <div className={`${expanded ? "px-4 py-4" : "px-2 py-3"}`}>
            <div className={`flex items-center ${expanded ? "gap-3" : "justify-center"}`}>
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-teal-200"
                title={!expanded ? `${nomeUsuario} · ${contextoLabel}` : undefined}
                aria-hidden={expanded}
              >
                {iniciaisUsuario(nomeUsuario)}
              </div>
              {expanded && (
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/80">
                    Bem-vindo (a)
                  </p>
                  <p className="truncate font-semibold text-white" title={nomeUsuario}>
                    {nomeUsuario}
                  </p>
                  <p className="truncate text-xs text-slate-400">{contextoLabel}</p>
                </div>
              )}
            </div>
            {!expanded && (
              <span className="sr-only">
                {nomeUsuario} · {contextoLabel}
              </span>
            )}
          </div>

          <div className="border-t border-white/10 p-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`flex w-full items-center rounded-xl py-2.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 ${
                expanded ? "gap-3 px-3" : "justify-center"
              }`}
              title={expanded ? "Recolher menu" : "Expandir menu"}
              aria-label={expanded ? "Recolher menu" : "Expandir menu"}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <IconChevronLeft className="h-5 w-5 shrink-0" />
                  <span className="text-sm">Recolher</span>
                </>
              ) : (
                <IconChevronRight className="h-5 w-5 shrink-0" />
              )}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-end gap-3 border-b border-slate-200/80 bg-white/90 px-6 py-3 backdrop-blur-md">
          <NovoLancamentoMenu />
          <ContextoSelector />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
