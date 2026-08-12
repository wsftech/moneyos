import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </IconBase>
  );
}

export function IconTransacoes(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 7h11l-2-3H5l2 3z" />
      <path d="M17 17H6l2 3h11l-2-3z" />
      <path d="M12 7v10" />
    </IconBase>
  );
}

export function IconContas(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h3" />
    </IconBase>
  );
}

export function IconCategorias(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path d="M19 5h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path d="M9 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z" />
    </IconBase>
  );
}

export function IconPagarReceber(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </IconBase>
  );
}

export function IconFinanciamentos(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 17h14v-5H5v5z" />
      <path d="M7 12V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </IconBase>
  );
}

export function IconEmprestimos(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9 11h6" />
    </IconBase>
  );
}

export function IconOrcamentos(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </IconBase>
  );
}

export function IconRelatorios(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17V9" />
      <path d="M12 17V7" />
      <path d="M16 17v-5" />
    </IconBase>
  );
}

export function IconConfiguracoes(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </IconBase>
  );
}

export function IconMetas(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconRecorrentes(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </IconBase>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 18l-6-6 6-6" />
    </IconBase>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 18l6-6-6-6" />
    </IconBase>
  );
}

export type NavIconComponent = typeof IconDashboard;

export const NAV_ICONS: Record<string, NavIconComponent> = {
  dashboard: IconDashboard,
  transacoes: IconTransacoes,
  contas: IconContas,
  categorias: IconCategorias,
  pagarReceber: IconPagarReceber,
  financiamentos: IconFinanciamentos,
  emprestimos: IconEmprestimos,
  orcamentos: IconOrcamentos,
  metas: IconMetas,
  recorrentes: IconRecorrentes,
  relatorios: IconRelatorios,
  configuracoes: IconConfiguracoes,
};
