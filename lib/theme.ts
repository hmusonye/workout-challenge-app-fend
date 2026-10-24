export type ThemePref = "system" | "light" | "dark";
const KEY = "reps-theme";
const COLORS = { light: "#f2f3ed", dark: "#10120f" };

/** Runs inline in <head> so the first paint already has the right theme. Keep in sync with applyTheme. */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePref=p;r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export const readThemePref = (): ThemePref => { try { const p = localStorage.getItem(KEY); return p === "light" || p === "dark" ? p : "system"; } catch { return "system"; } };
export const resolveTheme = (p: ThemePref) => p === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p;

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement, resolved = resolveTheme(pref);
  root.dataset.theme = resolved; root.dataset.themePref = pref; root.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", COLORS[resolved]));
  try { localStorage.setItem(KEY, pref); } catch {}
}

/** Re-resolves "system" when the OS theme flips. Returns an unsubscribe. */
export function watchSystemTheme(getPref: () => ThemePref) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const on = () => { if (getPref() === "system") applyTheme("system"); };
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}
