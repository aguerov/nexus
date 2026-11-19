import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

export function Appearance() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("nexus.theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // El tema del sistema funciona sin almacenamiento.
    }
    return "system";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("nexus.theme", theme); } catch { /* Preferencia de la sesión. */ }
  }, [theme]);

  return (
    <select aria-label="Tema de apariencia" title="Tema de apariencia"
      className="appearance" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
      <option value="system">Tema del sistema</option>
      <option value="light">Tema claro</option>
      <option value="dark">Tema oscuro</option>
    </select>
  );
}
