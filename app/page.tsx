"use client";

import { useState } from "react";
import { MapContainer } from "@/app/components/MapContainer";
import { SettingsButton } from "@/app/components/SettingsButton";
import { SettingsSidebar } from "@/app/components/SettingsSidebar";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Map */}
      <MapContainer />

      {/* Settings button */}
      <SettingsButton onClick={() => setSettingsOpen(!settingsOpen)} />

      {/* Settings sidebar */}
      <SettingsSidebar isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
