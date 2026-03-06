import { useCallback } from "react";

import type { Room } from "../../types";

interface VentilationRowProps {
  room: Room;
  onUpdate: (partial: Partial<Room>) => void;
}

/**
 * Uitklapbare rij met ventilatie-instellingen per vertrek.
 *
 * Velden: q_v [dm³/s], mech. afvoer, mech. toevoer, f_buitenlucht.
 */
export function VentilationRow({ room, onUpdate }: VentilationRowProps) {
  const handleQvChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ ventilation_rate: Number(e.target.value) || 0 });
    },
    [onUpdate],
  );

  const handleExhaustChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ has_mechanical_exhaust: e.target.checked });
    },
    [onUpdate],
  );

  const handleSupplyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ has_mechanical_supply: e.target.checked });
    },
    [onUpdate],
  );

  const handleFractionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ fraction_outside_air: Number(e.target.value) || 0 });
    },
    [onUpdate],
  );

  return (
    <tr className="border-b border-stone-100 bg-amber-50/30">
      <td colSpan={11} className="px-3 py-2">
        <div className="flex items-center gap-6 text-xs">
          {/* q_v */}
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-stone-500">
              q<sub>v</sub> [dm³/s]
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={room.ventilation_rate || ""}
              onChange={handleQvChange}
              className="w-16 rounded border border-stone-200 px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-blue-400 focus:outline-none"
              placeholder="0"
            />
          </label>

          {/* Mech. afvoer */}
          <label className="flex items-center gap-1.5 text-stone-500">
            <input
              type="checkbox"
              checked={room.has_mechanical_exhaust ?? false}
              onChange={handleExhaustChange}
              className="h-3.5 w-3.5 rounded border-stone-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="font-medium">Mech. afvoer</span>
          </label>

          {/* Mech. toevoer */}
          <label className="flex items-center gap-1.5 text-stone-500">
            <input
              type="checkbox"
              checked={room.has_mechanical_supply ?? false}
              onChange={handleSupplyChange}
              className="h-3.5 w-3.5 rounded border-stone-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="font-medium">Mech. toevoer</span>
          </label>

          {/* f_buitenlucht */}
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-stone-500">
              f<sub>buitenlucht</sub>
            </span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={room.fraction_outside_air ?? ""}
              onChange={handleFractionChange}
              className="w-14 rounded border border-stone-200 px-1.5 py-0.5 text-right text-xs tabular-nums focus:border-blue-400 focus:outline-none"
              placeholder="1.0"
            />
          </label>
        </div>
      </td>
    </tr>
  );
}
