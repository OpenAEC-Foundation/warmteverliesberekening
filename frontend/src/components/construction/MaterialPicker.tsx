import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useClickOutside } from "../../hooks/useClickOutside";
import {
  resolvePatternId,
  getPatternSvgString,
  CATEGORY_PATTERN_MAP,
} from "../../lib/hatchPatterns";
import {
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_CATEGORY_ORDER,
  MATERIAL_CATEGORY_VISUALS,
  searchMaterials,
  type Material,
  type MaterialCategory,
} from "../../lib/materialsDatabase";

/** Inline SVG preview van een hatch pattern (20x20px). */
function HatchPreview({
  patternId,
  color,
  size = 18,
}: {
  patternId: string;
  color: string;
  size?: number;
}) {
  const patternSvg = getPatternSvgString(patternId as never);
  if (!patternSvg) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 rounded-sm border border-black/10"
      dangerouslySetInnerHTML={{
        __html: `<defs>${patternSvg}</defs><rect width="${size}" height="${size}" fill="${color}" fill-opacity="0.55"/><rect width="${size}" height="${size}" fill="url(#${patternId})"/>`,
      }}
    />
  );
}

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
      className="w-80 rounded-lg border border-[var(--oaec-border)] bg-[var(--oaec-bg-lighter)] shadow-xl"
    >
      {/* Zoekbalk */}
      <div className="border-b border-[var(--oaec-border)] p-2">
        <input
          type="text"
          placeholder="Zoek materiaal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-[var(--oaec-border)] px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          autoFocus
        />
      </div>

      {/* Categorie-groepen */}
      <div className="max-h-80 overflow-y-auto">
        {MATERIAL_CATEGORY_ORDER.map((cat) => {
          const materials = filtered.get(cat);
          if (!materials) return null;
          const catVisual = MATERIAL_CATEGORY_VISUALS[cat];
          const catPatternId = CATEGORY_PATTERN_MAP[cat];

          return (
            <div key={cat}>
              <div className="sticky top-0 flex items-center gap-2 bg-surface-alt px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
                <HatchPreview
                  patternId={catPatternId}
                  color={catVisual.color}
                />
                {MATERIAL_CATEGORY_LABELS[cat]}
              </div>
              {materials.map((mat) => {
                const matPatternId = resolvePatternId(
                  mat.category,
                  mat.hatchPattern,
                );
                const showMatPreview =
                  mat.hatchPattern && matPatternId !== catPatternId;

                return (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => handleSelect(mat)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-blue-600/15"
                  >
                    <span className="flex items-center gap-1.5 text-on-surface-secondary">
                      {showMatPreview && (
                        <HatchPreview
                          patternId={matPatternId}
                          color={catVisual.color}
                          size={14}
                        />
                      )}
                      {mat.name}
                    </span>
                    <span className="ml-2 tabular-nums text-on-surface-muted">
                      {mat.lambda !== null
                        ? `\u03BB=${mat.lambda}`
                        : mat.rdFixed !== null
                          ? `Rd=${mat.rdFixed}`
                          : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {filtered.size === 0 && (
          <div className="px-3 py-3 text-center text-sm text-on-surface-muted">
            Geen resultaten
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(picker, document.body);
}
