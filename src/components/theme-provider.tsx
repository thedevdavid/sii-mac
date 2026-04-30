import { createContext, use, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

function resolveSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  // DOM mutation side effect: sync the root element's class whenever theme
  // changes. Also subscribes to the OS color-scheme media query when `system`
  // is selected so the UI follows OS-level theme flips live.
  useEffect(() => {
    const root = window.document.documentElement;
    const applyClass = (cls: "light" | "dark") => {
      root.classList.remove("light", "dark");
      root.classList.add(cls);
    };

    if (theme !== "system") {
      applyClass(theme);
      return;
    }

    applyClass(resolveSystemTheme());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyClass(resolveSystemTheme());
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setTheme(next);
    },
  };

  return (
    <ThemeProviderContext value={value}>{children}</ThemeProviderContext>
  );
}

export const useTheme = (): ThemeProviderState => {
  const context = use(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
