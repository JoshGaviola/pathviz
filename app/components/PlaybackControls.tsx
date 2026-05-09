interface PlaybackControlsProps {
  isPlaybackRunning: boolean;
  isPlaybackReady: boolean;
  onTogglePlayback: () => void;
  onStepPlayback: () => void;
  onResetPlayback: () => void;
}

export function PlaybackControls({
  isPlaybackRunning,
  isPlaybackReady,
  onTogglePlayback,
  onStepPlayback,
  onResetPlayback,
}: PlaybackControlsProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(92vw,720px)] -translate-x-1/2">
      <div className="pointer-events-auto rounded-xl border border-slate-700/90 bg-slate-950/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Visualization Controls
          </p>
          <p className="text-[11px] text-slate-400">
            Left-click start, right-click goal
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!isPlaybackReady}
            onClick={onTogglePlayback}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {isPlaybackRunning ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            disabled={!isPlaybackReady}
            onClick={onStepPlayback}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            Step
          </button>
          <button
            type="button"
            disabled={!isPlaybackReady}
            onClick={onResetPlayback}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
