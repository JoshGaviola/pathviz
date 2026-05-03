import { type MapStyleType } from "@/app/lib/mapStyles";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mapStyle?: MapStyleType;
  onMapStyleChange?: (style: MapStyleType) => void;
  radiusKm?: number;
  onRadiusChange?: (radiusKm: number) => void;
}

export function SettingsSidebar({
  isOpen,
  onClose,
  mapStyle = "dark",
  onMapStyleChange,
  radiusKm = 0.15,
  onRadiusChange,
}: SettingsSidebarProps) {
  return (
    <>
      {/* Sidebar overlay - slides in from right */}
      <div
        className={`absolute inset-y-0 right-0 z-20 w-80 transform bg-slate-950 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col overflow-y-auto border-l border-slate-700">
          {/* Sidebar header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Close settings"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Sidebar content */}
          <div className="flex-1 space-y-6 px-6 py-4">
            {/* Map style section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Map Style
              </label>
              <select
                className="mt-2 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 transition hover:ring-slate-600"
                value={mapStyle}
                onChange={(event) =>
                  onMapStyleChange?.(event.target.value as MapStyleType)
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="streets">Streets</option>
              </select>
            </div>

            {/* Algorithm section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Algorithm
              </label>
              <select className="mt-2 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 transition hover:ring-slate-600">
                <option>Dijkstra</option>
                <option>A*</option>
              </select>
            </div>

            {/* Speed section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Animation Speed
              </label>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                defaultValue="1"
                className="mt-2 w-full"
              />
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>Slow</span>
                <span>Fast</span>
              </div>
            </div>

            {/* Radius section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Selection Radius
              </label>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={radiusKm}
                onChange={(event) => onRadiusChange?.(Number(event.target.value))}
                className="mt-2 w-full"
              />
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>0.05 km</span>
                <span>{radiusKm.toFixed(2)} km</span>
                <span>1 km</span>
              </div>
            </div>

            {/* Legend section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Legend
              </label>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  <span className="text-sm text-slate-300">Visited nodes</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <span className="text-sm text-slate-300">Frontier</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-400" />
                  <span className="text-sm text-slate-300">Shortest path</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="text-sm text-slate-300">Start / Goal</span>
                </div>
              </div>
            </div>

            {/* Stats section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Statistics
              </label>
              <div className="mt-3 space-y-2 rounded bg-slate-800 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Visited:</span>
                  <span className="text-white">0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Path length:</span>
                  <span className="text-white">0 km</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Time:</span>
                  <span className="text-white">0 ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay backdrop - semi-transparent when sidebar is open */}
      {isOpen && (
        <button
          onClick={onClose}
          className="absolute inset-0 z-10 bg-black/30 transition-opacity"
          aria-label="Close settings panel"
        />
      )}
    </>
  );
}
