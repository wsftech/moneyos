import { NavLink, Outlet } from "react-router-dom";
import { PerfilForm } from "./AppBrand";
import { EscopoFinanceiroForm } from "./EscopoFinanceiroForm";

const TABS = [
  { to: "/configuracoes/perfil", label: "Perfil" },
  { to: "/configuracoes/tags", label: "Tags" },
  { to: "/configuracoes/contatos", label: "Contatos" },
  { to: "/configuracoes/regras", label: "Regras" },
  { to: "/configuracoes/notificacoes", label: "Notificações" },
  { to: "/configuracoes/dados", label: "Backup" },
  { to: "/configuracoes/sobre", label: "Sobre" },
] as const;

export function ConfiguracoesLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">Perfil, escopo financeiro, tags e preferências</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition-all sm:flex-none ${
                isActive
                  ? "bg-app-sidebar text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
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

export function ConfiguracoesPerfilPage() {
  return (
    <div className="space-y-4">
      <section className="app-card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Perfil</h2>
        <PerfilForm />
      </section>
      <section className="app-card p-5">
        <EscopoFinanceiroForm />
      </section>
    </div>
  );
}
