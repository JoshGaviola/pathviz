"use client";

import { useState } from "react";
import { MapContainer } from "@/app/components/MapContainer";
import { SettingsButton } from "@/app/components/SettingsButton";
import { SettingsSidebar } from "@/app/components/SettingsSidebar";
import { type MapStyleType } from "@/app/lib/mapStyles";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleType>("streets");
  const [selectionRadiusKm, setSelectionRadiusKm] = useState(0.15);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Map */}
      <MapContainer mapStyle={mapStyle} selectionRadiusKm={selectionRadiusKm} />

      {/* Settings button */}
      <SettingsButton onClick={() => setSettingsOpen(!settingsOpen)} />

      {/* Settings sidebar */}
      <SettingsSidebar
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mapStyle={mapStyle}
        onMapStyleChange={setMapStyle}
        radiusKm={selectionRadiusKm}
        onRadiusChange={setSelectionRadiusKm}
      />
    </div>
  );
}
