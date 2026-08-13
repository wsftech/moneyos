import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { AppLogo } from "./AppBrand";

export function TitleBar() {
  const [maximizada, setMaximizada] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximizada);
    const un = win.onResized(() => {
      void win.isMaximized().then(setMaximizada);
    });
    return () => {
      void un.then((fn) => fn());
    };
  }, []);

  async function minimizar() {
    if (!isTauri()) return;
    await getCurrentWindow().minimize();
  }

  async function alternarMaximizar() {
    if (!isTauri()) return;
    await getCurrentWindow().toggleMaximize();
  }

  async function fechar() {
    if (!isTauri()) return;
    await getCurrentWindow().close();
  }

  async function iniciarArraste(e: MouseEvent<HTMLElement>) {
    if (!isTauri() || e.button !== 0 || e.detail > 1) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ambiente sem janela Tauri */
    }
  }

  return (
    <header className="flex h-11 shrink-0 select-none items-stretch border-b border-white/10 bg-app-sidebar text-slate-200">
      <div
        className="titlebar-drag flex items-center px-3"
        data-tauri-drag-region
        onMouseDown={(e) => void iniciarArraste(e)}
        onDoubleClick={() => void alternarMaximizar()}
      >
        <AppLogo
          variant="logo"
          className="pointer-events-none h-7 w-auto max-w-[200px]"
          title="WSF Money"
        />
      </div>
      <div
        className="titlebar-drag min-w-0 flex-1"
        data-tauri-drag-region
        onMouseDown={(e) => void iniciarArraste(e)}
        onDoubleClick={() => void alternarMaximizar()}
      />
      <div className="titlebar-no-drag flex">
        <WindowButton label="Minimizar" onClick={() => void minimizar()}>
          <IconMinimize />
        </WindowButton>
        <WindowButton
          label={maximizada ? "Restaurar" : "Maximizar"}
          onClick={() => void alternarMaximizar()}
        >
          {maximizada ? <IconRestore /> : <IconMaximize />}
        </WindowButton>
        <WindowButton label="Fechar" onClick={() => void fechar()} danger>
          <IconClose />
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      className={`titlebar-no-drag flex h-11 w-12 items-center justify-center text-slate-300 transition-colors ${
        danger
          ? "hover:bg-rose-600 hover:text-white"
          : "hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function IconMinimize() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path fill="currentColor" d="M1 6.25h10v1.1H1z" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        d="M2.2 2.2h7.6v7.6H2.2z"
      />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        d="M3.6 4.2h5.2v5.2H3.6zM3.2 7.8H2.2V2.2h5.6v1"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.2 1.45 6 5.25l3.8-3.8.75.75L6.75 6l3.8 3.8-.75.75L6 6.75l-3.8 3.8-.75-.75L5.25 6 1.45 2.2z"
      />
    </svg>
  );
}
