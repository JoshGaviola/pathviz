"use client";

import { useState } from "react";
import { MapContainer } from "./components/MapContainer";
import { PlaybackControls } from "./components/PlaybackControls";
import { SettingsButton } from "./components/SettingsButton";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { type MapStyleType } from "./lib/mapStyles";
import { type PathfindingAlgorithmType } from "./lib/pathfinding";

type PlaybackAction = "toggle" | "step" | "reset";

interface PlaybackCommand {
  id: number;
  action: PlaybackAction;
}

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleType>("streets");
  const [selectionRadiusKm, setSelectionRadiusKm] = useState(2);
  const [algorithm, setAlgorithm] = useState<PathfindingAlgorithmType>("astar");
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [showRoadOverlay, setShowRoadOverlay] = useState(false);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);
  const [isPlaybackReady, setIsPlaybackReady] = useState(false);
  const [playbackCommand, setPlaybackCommand] = useState<PlaybackCommand | undefined>();

  const sendPlaybackCommand = (action: PlaybackAction) => {
    setPlaybackCommand((previous) => ({
      id: (previous?.id ?? 0) + 1,
      action,
    }));
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Map */}
      <MapContainer
        mapStyle={mapStyle}
        selectionRadiusKm={selectionRadiusKm}
        algorithm={algorithm}
        animationSpeed={animationSpeed}
        showRoadOverlay={showRoadOverlay}
        playbackCommand={playbackCommand}
        onPlaybackRunningChange={setIsPlaybackRunning}
        onPlaybackReadyChange={setIsPlaybackReady}
      />

      <PlaybackControls
        isPlaybackRunning={isPlaybackRunning}
        isPlaybackReady={isPlaybackReady}
        onTogglePlayback={() => sendPlaybackCommand("toggle")}
        onStepPlayback={() => sendPlaybackCommand("step")}
        onResetPlayback={() => sendPlaybackCommand("reset")}
      />

      {/* Settings button */}
      <SettingsButton onClick={() => setSettingsOpen(!settingsOpen)} />

      {/* Settings sidebar */}
      <SettingsSidebar
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mapStyle={mapStyle}
        onMapStyleChange={setMapStyle}
        algorithm={algorithm}
        onAlgorithmChange={setAlgorithm}
        animationSpeed={animationSpeed}
        onAnimationSpeedChange={setAnimationSpeed}
        radiusKm={selectionRadiusKm}
        onRadiusChange={setSelectionRadiusKm}
        showRoadOverlay={showRoadOverlay}
        onShowRoadOverlayChange={setShowRoadOverlay}
      />
    </div>
  );
}
