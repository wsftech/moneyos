import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/configuracoes/contas", label: "Contas" },
  { to: "/configuracoes/categorias", label: "Categorias" },
  { to: "/configuracoes/tags", label: "Tags" },
  { to: "/configuracoes/regras", label: "Regras" },
  { to: "/configuracoes/notificacoes", label: "Notificações" },
  { to: "/configuracoes/dados", label: "Backup" },
  { to: "/configuracoes/sobre", label: "Sobre" },
] as const;

export function ConfiguracoesLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">Contas, categorias e estrutura do sistema</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition-all sm:flex-none ${
                isActive
                  ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
