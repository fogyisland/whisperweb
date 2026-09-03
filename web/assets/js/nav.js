// Site chrome — header (with theme toggle, mobile nav, current-page highlight) + footer.
// Injects header/footer into placeholder elements so each page stays small.
(function () {
  "use strict";

  const NAV_LINKS = [
    { href: "index.html", label: "首页" },
    { href: "playground.html", label: "运行平台" },
    { href: "cli.html", label: "命令行" },
    { href: "models.html", label: "模型" },
    { href: "output-formats.html", label: "输出格式" },
    { href: "languages.html", label: "语言" },
  ];

  function currentPage() {
    const path = window.location.pathname;
    const last = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    return last || "index.html";
  }

  function renderHeader() {
    const slot = document.querySelector("[data-site-header]");
    if (!slot) return;

    const here = currentPage();

    const navHtml = NAV_LINKS
      .map((l) => {
        const active = l.href === here || (l.href === "index.html" && here === "");
        return `<a href="${l.href}"${active ? ' aria-current="page"' : ""}>${l.label}</a>`;
      })
      .join("");

    slot.innerHTML = `
      <div class="container site-header-inner">
        <a class="brand" href="index.html">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>Whisper 中文手册</span>
        </a>
        <button class="nav-toggle" type="button" aria-label="切换导航" aria-expanded="false" data-nav-toggle>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <nav class="nav" id="primary-nav" data-nav>
          ${navHtml}
          <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="切换主题">
            <span data-theme-icon></span>
            <span class="sr-only theme-label">主题</span>
          </button>
        </nav>
      </div>
    `;
  }

  function renderFooter() {
    const slot = document.querySelector("[data-site-footer]");
    if (!slot) return;
    slot.innerHTML = `
      <div class="container">
        <div>
          基于 <a href="https://github.com/openai/whisper" target="_blank" rel="noopener">OpenAI Whisper</a> · <a href="https://github.com/openai/whisper/blob/main/LICENSE" target="_blank" rel="noopener">MIT</a> · <a href="https://arxiv.org/abs/2212.04356" target="_blank" rel="noopener">论文</a>
        </div>
        <div>本站不部署推理服务。</div>
      </div>
    `;
  }

  function wireHeaderEvents() {
    document.addEventListener("click", (e) => {
      const toggle = e.target.closest("[data-theme-toggle]");
      if (toggle && window.WW_theme) window.WW_theme.toggle();
    });

    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-nav-toggle]");
      if (!t) return;
      const nav = document.querySelector("[data-nav]");
      if (!nav) return;
      const isOpen = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!isOpen));
      t.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest(".nav a")) {
        const nav = document.querySelector("[data-nav]");
        if (nav) nav.setAttribute("data-open", "false");
        const t = document.querySelector("[data-nav-toggle]");
        if (t) t.setAttribute("aria-expanded", "false");
      }
    });
  }

  function init() {
    renderHeader();
    renderFooter();
    wireHeaderEvents();
    if (window.WW_applyIcons) window.WW_applyIcons(document);
    if (window.WW_theme_watchSystem) window.WW_theme_watchSystem();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.WW_nav = { init, currentPage };
})();
