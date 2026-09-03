// 服务健康检查 —— ping /api/health，把 Python / 模型权重 / 平台状态写到页头徽章。
//
// 用法：
//   <span data-health-badge></span>           ← 自动渲染徽章
//   WW_HEALTH.ready() → Promise<boolean>     ← 编程接口
//   WW_HEALTH.info  → { ok, python, ... }    ← 最近一次结果

(function () {
  "use strict";

  let lastResult = null;
  let listeners = [];

  function renderBadge(root) {
    const badges = (root || document).querySelectorAll("[data-health-badge]");
    badges.forEach((el) => {
      if (!lastResult) {
        el.innerHTML = `<span class="health-dot health-loading"></span><span class="health-text">检查中…</span>`;
        return;
      }
      if (lastResult.ok) {
        el.innerHTML = `<span class="health-dot health-ok"></span><span class="health-text">Python 就绪 · ${escapeHtml(lastResult.python || "?")} · ${escapeHtml(lastResult.platform || "?")}</span>`;
        el.className = "health-badge health-badge-ok";
      } else {
        el.innerHTML = `<span class="health-dot health-bad"></span><span class="health-text">Python 未就绪 · <a href="#" data-health-help>查看原因</a></span>`;
        el.className = "health-badge health-badge-bad";
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showHelp() {
    if (!lastResult) return;
    const msg = lastResult.ok
      ? `Python: ${lastResult.python}\n平台: ${lastResult.platform}\nNode: ${lastResult.node}\nRunner 脚本可执行。`
      : `服务未就绪。\n\n` +
        `• Python 未检测到：先安装 Python 3.8+，Windows 上确保 PATH 含 python / py。\n` +
        `• Python 装了但没装 whisper：运行 pip install openai-whisper。\n` +
        `• 没装 ffmpeg：Whisper 需要它来解码音频。\n` +
        `• 检查 whisper_runner.py 是否在 Node 项目根目录。`;
    alert(msg);
  }

  async function check() {
    try {
      const r = await fetch("/api/health");
      if (!r.ok) throw new Error("HTTP " + r.status);
      lastResult = await r.json();
    } catch (e) {
      lastResult = { ok: false, error: e.message };
    }
    renderBadge();
    listeners.forEach((fn) => { try { fn(lastResult); } catch (_) {} });
    return lastResult;
  }

  function ready() {
    return lastResult ? Promise.resolve(lastResult.ok) : check().then((r) => r.ok);
  }

  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-health-help]")) {
        e.preventDefault();
        showHelp();
      }
    });
    renderBadge();
    check();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.WW_HEALTH = { check, ready, get info() { return lastResult; }, onUpdate(fn) { listeners.push(fn); } };
})();
