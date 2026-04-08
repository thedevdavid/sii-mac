import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [vibrancyMode, setVibrancyMode] = React.useState<"css" | "native">(
    () =>
      (localStorage.getItem("siimac-vibrancy") as "css" | "native") || "css",
  );

  function handleVibrancyChange(mode: "css" | "native") {
    setVibrancyMode(mode);
    localStorage.setItem("siimac-vibrancy", mode);

    import("@/lib/tauri-commands").then(({ setNativeVibrancy }) => {
      setNativeVibrancy(mode === "native");
    });

    document.documentElement.classList.toggle(
      "native-vibrancy",
      mode === "native",
    );
  }

  return (
    <div className="space-y-5 p-5">
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Appearance
        </h3>
        <div className="divide-y rounded-lg border">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">
                Choose light, dark, or match your system.
              </p>
            </div>
            <ModeToggle />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">Sidebar Translucency</p>
              <p className="text-xs text-muted-foreground">
                CSS simulates the glass effect. Native uses real macOS vibrancy.
              </p>
            </div>
            <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
              <button
                onClick={() => handleVibrancyChange("css")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  vibrancyMode === "css"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                CSS
              </button>
              <button
                onClick={() => handleVibrancyChange("native")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  vibrancyMode === "native"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Native
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
