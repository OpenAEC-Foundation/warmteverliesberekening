import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useClickOutside } from "../../hooks/useClickOutside";
import {
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_CATEGORY_ORDER,
  searchMaterials,
  type Material,
  type MaterialCategory,
} from "../../lib/materialsDatabase";

interface MaterialPickerProps {
  onSelect: (material: Material) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
}

export function MaterialPicker({
  onSelect,
  onClose,
  anchorRect,
}: MaterialPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  useClickOutside(ref, onClose);

  const filtered = useMemo(() => {
    const materials = searchMaterials(search);
    const map = new Map<MaterialCategory, Material[]>();
    for (const mat of materials) {
      const list = map.get(mat.category) ?? [];
      list.push(mat);
      map.set(mat.category, list);
    }
    return map;
  }, [search]);

  const handleSelect = useCallback(
    (material: Material) => {
      onSelect(material);
    },
    [onSelect],
  );

  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false });

  useEffect(() => {
    if (!anchorRect) return;
    const PICKER_HEIGHT = 400;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const flipUp = spaceBelow < PICKER_HEIGHT && anchorRect.top > PICKER_HEIGHT;

    setPos({
      top: flipUp ? anchorRect.top : anchorRect.bottom + 4,
      left: Math.min(anchorRect.left, window.innerWidth - 320),
      flipUp,
    });
  }, [anchorRect]);

  if (!anchorRect) return null;

  const picker = (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.flipUp ? undefined : pos.top,
        bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
        left: pos.left,
        zIndex: 60,
      }}
      className="w-80 rounded-lg border border-stone-200 bg-white shadow-xl"
    >
      {/* Zoekbalk */}
      <div className="border-b border-stone-200 p-2">
        <input
          type="text"
          placeholder="Zoek materiaal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          autoFocus
        />
      </div>

      {/* Categorie-groepen */}
      <div className="max-h-80 overflow-y-auto">
        {MATERIAL_CATEGORY_ORDER.map((cat) => {
          const materials = filtered.get(cat);
          if (!materials) return null;
          return (
            <div key={cat}>
              <div className="sticky top-0 bg-stone-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
                {MATERIAL_CATEGORY_LABELS[cat]}
              </div>
              {materials.map((mat) => (
                <button
                  key={mat.id}
                  type="button"
                  onClick={() => handleSelect(mat)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-blue-50"
                >
                  <span className="text-stone-700">{mat.name}</span>
                  <span className="ml-2 tabular-nums text-stone-400">
                    {mat.lambda !== null
                      ? `\u03BB=${mat.lambda}`
                      : mat.rdFixed !== null
                        ? `Rd=${mat.rdFixed}`
                        : ""}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
        {filtered.size === 0 && (
          <div className="px-3 py-3 text-center text-sm text-stone-400">
            Geen resultaten
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(picker, document.body);
}
