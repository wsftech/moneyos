import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { Select } from "./ui/FormFields";
import { listTags } from "../db/tags";
import type { Tag } from "../types";

export function TagSelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    void listTags("consolidado").then(setTags);
  }, []);

  function addTag() {
    const id = Number(selected);
    if (!id || value.includes(id)) return;
    onChange([...value, id]);
    setSelected("");
  }

  function removeTag(id: number) {
    onChange(value.filter((t) => t !== id));
  }

  const selectedTags = tags.filter((t) => value.includes(t.id));
  const available = tags.filter((t) => !value.includes(t.id));

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-300">Tags / centros de custo</span>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: tag.cor }}
              onClick={() => removeTag(tag.id)}
              title="Remover tag"
            >
              {tag.nome} ×
            </button>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="flex gap-2">
          <Select
            label=""
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            options={[
              { value: "", label: "Adicionar tag..." },
              ...available.map((t) => ({ value: String(t.id), label: t.nome })),
            ]}
          />
          <Button type="button" variant="secondary" className="mt-auto" onClick={addTag}>
            Adicionar
          </Button>
        </div>
      )}
      {tags.length === 0 && (
        <p className="text-xs text-slate-500">
          Cadastre tags em Configurações → Tags.
        </p>
      )}
    </div>
  );
}
