import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

export type ConfirmTone = "danger" | "default";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type PendingConfirm = {
  options: Required<Omit<ConfirmOptions, "tone">> & { tone: ConfirmTone };
  resolve: (value: boolean) => void;
};

function normalizeOptions(input: ConfirmOptions | string): PendingConfirm["options"] {
  if (typeof input === "string") {
    return {
      title: "Confirmar exclusão",
      message: input,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
    };
  }
  return {
    title: input.title ?? "Confirmar exclusão",
    message: input.message,
    confirmLabel: input.confirmLabel ?? (input.tone === "default" ? "Confirmar" : "Excluir"),
    cancelLabel: input.cancelLabel ?? "Cancelar",
    tone: input.tone ?? "danger",
  };
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const close = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((input) => {
    return new Promise<boolean>((resolve) => {
      const next: PendingConfirm = {
        options: normalizeOptions(input),
        resolve,
      };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.options.title ?? "Confirmar"}
      >
        {pending && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{pending.options.message}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => close(false)}>
                {pending.options.cancelLabel}
              </Button>
              <Button
                type="button"
                variant={pending.options.tone === "danger" ? "danger" : "primary"}
                onClick={() => close(true)}
                autoFocus
              >
                {pending.options.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm deve ser usado dentro de ConfirmProvider");
  }
  return ctx;
}
