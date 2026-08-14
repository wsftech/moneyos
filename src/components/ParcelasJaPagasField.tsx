import { Input } from "./ui/FormFields";

export function ParcelasJaPagasField({
  value,
  onChange,
  totalParcelas,
  hint,
}: {
  value: number;
  onChange: (qtd: number) => void;
  totalParcelas: number;
  /** Texto de ajuda; se omitido, usa o padrão de dívidas. */
  hint?: string;
}) {
  return (
    <div>
      <Input
        label="Parcelas já pagas"
        type="number"
        min="0"
        max={totalParcelas > 0 ? String(Math.max(0, totalParcelas - 1)) : undefined}
        value={value === 0 ? "" : String(value)}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
      <p className="-mt-2 text-xs text-slate-500">
        {hint ?? (
          <>
            Só o número — o saldo restante já fica certo. Datas e valores reais: use{" "}
            <strong>Registrar anteriores</strong> no contrato.
          </>
        )}
      </p>
    </div>
  );
}
