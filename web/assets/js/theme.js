// Theme management — light/dark with system preference fallback and localStorage persistence.
(function () {
  "use strict";

  const STORAGE_KEY = "whisperweb:theme";

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setStored(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* ignore */ }
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("theme-dark");
    } else {
      root.classList.remove("theme-dark");
    }
    root.setAttribute("data-theme", theme);

    // Update any theme toggle buttons.
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const isDark = theme === "dark";
      btn.setAttribute("aria-pressed", String(isDark));
      btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
      const label = btn.querySelector(".theme-label");
      if (label) label.textContent = isDark ? "Light" : "Dark";
      const iconWrap = btn.querySelector("[data-theme-icon]");
      if (iconWrap) {
        const name = isDark ? "sun" : "moon";
        iconWrap.innerHTML = (window.WW_ICONS || {})[name] || "";
      }
    });
  }

  function currentTheme() {
    return document.documentElement.classList.contains("theme-dark") ? "dark" : "light";
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    setStored(next);
    applyTheme(next);
  }

  // Apply on load — before paint, inline in <head>.
  function initEarly() {
    const stored = getStored();
    const theme = stored || (systemPrefersDark() ? "dark" : "light");
    applyTheme(theme);
  }

  // Watch system preference changes if user hasn't explicitly chosen.
  function watchSystem() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (!getStored()) applyTheme(mq.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  window.WW_theme = { toggle: toggleTheme, apply: applyTheme, current: currentTheme };
  window.WW_theme_initEarly = initEarly;
  window.WW_theme_watchSystem = watchSystem;
})();
