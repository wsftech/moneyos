import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ContextoSelector } from "./ContextoSelector";
import { IconChevronLeft, IconChevronRight, NAV_ICONS } from "./NavIcons";
import { useContexto } from "../contexts/ContextoContext";
import { contarAlertasOrcamento } from "../db/alertasOrcamento";
import { verificarLembretesVencimento } from "../services/lembretesVencimento";
import { verificarAtualizacaoSilenciosa } from "../services/atualizacoes";
const SIDEBAR_STORAGE_KEY = "moneyos_sidebar_expanded";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true, icon: "dashboard" as const },
  { to: "/transacoes", label: "Transações", icon: "transacoes" as const },
  { to: "/contas-pagar-receber", label: "A pagar/receber", icon: "pagarReceber" as const },
  { to: "/dividas-parceladas", label: "Dívidas parceladas", icon: "financiamentos" as const },
  { to: "/orcamentos", label: "Orçamentos", icon: "orcamentos" as const, badgeKey: "orcamentos" as const },
  { to: "/metas", label: "Metas", icon: "metas" as const },
  { to: "/relatorios", label: "Relatórios", icon: "relatorios" as const },
  { to: "/configuracoes", label: "Configurações", icon: "configuracoes" as const },
];
function readExpandedPreference(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

export function Layout() {
  const { label: contextoLabel, contexto } = useContexto();
  const [expanded, setExpanded] = useState(readExpandedPreference);
  const [alertasOrcamento, setAlertasOrcamento] = useState(0);

  useEffect(() => {
    void contarAlertasOrcamento(contexto).then(setAlertasOrcamento);
    void verificarLembretesVencimento(contexto);
    void verificarAtualizacaoSilenciosa();
    const interval = window.setInterval(() => {
      void verificarLembretesVencimento(contexto);
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
        className={`flex h-full shrink-0 flex-col border-r border-white/[0.06] bg-[#1c1c1e]/98 backdrop-blur-xl transition-[width] duration-300 ease-in-out ${
          expanded ? "w-56" : "w-[4.25rem]"
        }`}
      >
        <div className={`border-b border-white/10 ${expanded ? "px-4 py-5" : "px-2 py-4"}`}>
          <div className={`flex items-center ${expanded ? "gap-3" : "justify-center"}`}>
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30"
              title={expanded ? undefined : `Money OS · ${contextoLabel}`}
            >
              M
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="truncate font-bold text-white">Money OS</p>
                <p className="truncate text-xs text-slate-400">{contextoLabel}</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const badge =
              item.badgeKey === "orcamentos" && alertasOrcamento > 0 ? alertasOrcamento : null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={expanded ? undefined : item.label}
                className={({ isActive }) =>
                  `relative flex items-center rounded-xl text-sm font-medium transition-all ${
                    expanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5"
                  } ${
                    isActive
                      ? "app-nav-active"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`
                }
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
          })}        </nav>

        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`flex w-full items-center rounded-xl py-2.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 ${
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
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-end border-b border-white/[0.06] bg-[#1c1c1e]/80 px-6 py-3 backdrop-blur-md">
          <ContextoSelector />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
