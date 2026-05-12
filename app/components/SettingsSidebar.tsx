import { type MapStyleType } from "@/app/lib/mapStyles";
import { type PathfindingAlgorithmType } from "@/app/lib/pathfinding";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mapStyle?: MapStyleType;
  onMapStyleChange?: (style: MapStyleType) => void;
  algorithm?: PathfindingAlgorithmType;
  onAlgorithmChange?: (algorithm: PathfindingAlgorithmType) => void;
  animationSpeed?: number;
  onAnimationSpeedChange?: (speed: number) => void;
  radiusKm?: number;
  onRadiusChange?: (radiusKm: number) => void;
  showRoadOverlay?: boolean;
  onShowRoadOverlayChange?: (show: boolean) => void;
  mapCenter?: { lng: number; lat: number; zoom: number };
}

export function SettingsSidebar({
  isOpen,
  onClose,
  mapStyle = "dark",
  onMapStyleChange,
  algorithm = "astar",
  onAlgorithmChange,
  animationSpeed = 1,
  onAnimationSpeedChange,
  radiusKm = 2,
  onRadiusChange,
  showRoadOverlay = false,
  onShowRoadOverlayChange,
  mapCenter = { lng: 0, lat: 0, zoom: 0 },
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
              <select
                className="mt-2 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 transition hover:ring-slate-600"
                value={algorithm}
                onChange={(event) =>
                  onAlgorithmChange?.(event.target.value as PathfindingAlgorithmType)
                }
              >
                <option value="astar">A*</option>
                <option value="dijkstra">Dijkstra</option>
                <option value="greedy">Greedy Best-First</option>
                <option value="bidirectional">Bidirectional Search</option>
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
                max="3"
                step="0.1"
                value={animationSpeed}
                onChange={(event) => onAnimationSpeedChange?.(Number(event.target.value))}
                className="mt-2 w-full"
              />
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>Slow</span>
                <span>{animationSpeed.toFixed(1)}x</span>
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
                min="2"
                max="20"
                step="1"
                value={radiusKm}
                onChange={(event) => onRadiusChange?.(Number(event.target.value))}
                className="mt-2 w-full"
              />
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>2 km</span>
                <span>{radiusKm.toFixed(0)} km</span>
                <span>20 km</span>
              </div>
            </div>

            {/* Road overlay toggle */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Road Overlay
              </label>
              <label className="mt-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={showRoadOverlay}
                  onChange={(event) => onShowRoadOverlayChange?.(event.target.checked)}
                  className="h-4 w-4 rounded bg-slate-800 accent-emerald-500"
                />
                <span className="text-sm text-slate-300">{showRoadOverlay ? "Visible" : "Hidden"}</span>
              </label>
            </div>

            {/* Map coordinates section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Map Coordinates
              </label>
              <div className="mt-3 rounded bg-slate-800 p-3 font-mono text-xs text-slate-300">
                <div className="truncate">Lng: {mapCenter.lng.toFixed(6)}</div>
                <div className="truncate">Lat: {mapCenter.lat.toFixed(6)}</div>
                <div className="truncate">Zoom: {mapCenter.zoom.toFixed(2)}</div>
              </div>
            </div>

            {/* Legend section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Legend
              </label>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded bg-emerald-500" />
                  <span className="text-sm text-slate-300">Explored edges</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded bg-red-700" />
                  <span className="text-sm text-slate-300">Shortest path</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-sm text-slate-300">Start point</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-red-800" />
                  <span className="text-sm text-slate-300">End point</span>
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
