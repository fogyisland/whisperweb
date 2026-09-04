// Whisper 运行平台 —— 把音频 POST 给 /api/transcribe，实时消费 SSE 事件并渲染结果。
//
// 数据来源：
//   - 样本：fetch(currentSample.file) → Blob
//   - 上传：直接从 <input type=file> 取 File

(function () {
  "use strict";

  let currentSample = null;
  let uploadedFile = null;
  let lastResult = null;
  let currentTask = "transcribe";  // 模块级变量，readSettings 直接读，wirePlayground 改

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ===== 控件填充 =====
  function populateControls(root) {
    const MODELS = window.WW_MODELS || [];
    const LANGS = window.WW_LANGUAGES || [];

    const modelSel = $("[name=model]", root);
    if (modelSel) {
      const enGroup = MODELS.filter((m) => m.en_only);
      const multiGroup = MODELS.filter((m) => !m.en_only);
      modelSel.innerHTML =
        `<optgroup label="English-only">${enGroup.map((m) => `<option value="${m.id}">${m.id} — ${m.params_m}M · ${m.speed_x}×</option>`).join("")}</optgroup>` +
        `<optgroup label="Multilingual">${multiGroup.map((m) => `<option value="${m.id}">${m.id} — ${m.params_m}M · ${m.speed_x}×</option>`).join("")}</optgroup>`;
    }

    const langSel = $("[name=language]", root);
    if (langSel) {
      langSel.innerHTML = `<option value="">自动识别</option>` +
        LANGS.map(([code, name, flag]) => `<option value="${code}">${flag ? flag + " " : ""}${name} (${code})</option>`).join("");
    }
  }

  // ===== 样本/上传 切换 =====
  function selectSample(id, root) {
    const SAMPLES = window.WW_SAMPLES || [];
    const sample = SAMPLES.find((s) => s.id === id) || SAMPLES[0];
    if (!sample) return;
    currentSample = sample;
    uploadedFile = null;
    const fileInput = $("#upload", root);
    if (fileInput) fileInput.value = "";

    const hint = $("[data-sample-hint]", root);
    if (hint) hint.textContent = sample.blurb;

    const audio = $("[data-audio]", root);
    if (audio) {
      audio.src = sample.file;
      audio.load();
    }
    drawWaveformFromUrl(sample.file, root);
  }

  function onUpload(file, root) {
    if (!file) return;
    uploadedFile = file;
    currentSample = null;
    const sel = $("[name=sample_id]", root);
    if (sel) sel.value = "";
    const hint = $("[data-sample-hint]", root);
    if (hint) hint.textContent = `已选择：${file.name}（${(file.size / 1024 / 1024).toFixed(2)} MB）`;
    const audio = $("[data-audio]", root);
    if (audio) {
      audio.src = URL.createObjectURL(file);
      audio.load();
    }
    drawWaveformFromBlob(file, root);
  }

  function getCsrf() { return null; }

  // ===== 波形 =====
  function drawWaveformFromUrl(url, root) {
    drawWaveformFromArrayBuffer(fetch(url).then((r) => r.arrayBuffer()), root);
  }
  function drawWaveformFromBlob(file, root) {
    drawWaveformFromArrayBuffer(file.arrayBuffer(), root);
  }
  async function drawWaveformFromArrayBuffer(promise, root) {
    const canvas = $("[data-waveform]", root);
    const placeholder = $("[data-waveform-placeholder]", root);
    const durationEl = $("[data-duration]", root);
    if (!canvas) return;
    if (placeholder) placeholder.style.display = "flex";
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      if (placeholder) placeholder.textContent = "浏览器不支持 WebAudio。";
      return;
    }
    try {
      const ctx = new AudioCtx();
      const buf = await promise;
      const decoded = await ctx.decodeAudioData(buf);
      drawBars(canvas, decoded.getChannelData(0), decoded.duration, durationEl, placeholder);
    } catch (e) {
      if (placeholder) placeholder.textContent = "波形解码失败：" + e.message;
      try { if (durationEl) durationEl.textContent = "—"; } catch (_) {}
    }
  }

  function drawBars(canvas, data, duration, durationEl, placeholder) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = getCssVar("--accent") || "#C25A2C";
    const bars = Math.max(60, Math.floor(w));
    const samplesPerBar = Math.floor(data.length / bars);
    const mid = h / 2;
    for (let i = 0; i < bars; i++) {
      let min = 1, max = -1;
      const start = i * samplesPerBar;
      const end = start + samplesPerBar;
      for (let j = start; j < end && j < data.length; j++) {
        const v = data[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yTop = mid - max * mid * 0.95;
      const barH = Math.max(1, mid - min * mid * 0.95);
      ctx.fillRect(i, yTop, 1, barH);
    }
    canvas.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
    if (durationEl) durationEl.textContent = duration.toFixed(1) + "s";
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ===== 设置读取 =====
  function readSettings(root) {
    const get = (name) => {
      const el = $("[name=" + name + "]", root);
      if (!el) return undefined;
      if (el.type === "checkbox") return el.checked;
      if (el.type === "number" || el.type === "range") {
        if (el.value === "" || el.value == null) return null;
        return Number(el.value);
      }
      return el.value === "" ? null : el.value;
    };
    return {
      model: get("model") || "turbo",
      task: currentTask,
      language: get("language") || null,
      output_format: get("output_format") || "json",
      temperature: Number(get("temperature") || 0),
      beam_size: Number(get("beam_size") || 5),
      word_timestamps: !!get("word_timestamps"),
      initial_prompt: get("initial_prompt") || "",
      compression_ratio_threshold: Number(get("compression_ratio_threshold") || 2.4),
      logprob_threshold: Number(get("logprob_threshold") || -1.0),
      no_speech_threshold: Number(get("no_speech_threshold") || 0.6),
      fp16: !!get("fp16"),
    };
  }

  // ===== 跑 =====
  async function runSimulation(root) {
    if (!currentSample && !uploadedFile) {
      alert("先选一段样本，或上传自己的音频。");
      return;
    }
    const btn = $("[data-run-btn]", root);
    const status = $("[data-run-status]", root);
    const stagesEl = $("[data-stages]", root);
    if (btn) btn.disabled = true;
    if (status) status.textContent = "准备上传…";

    // 准备音频 blob
    let blob, filename;
    if (uploadedFile) {
      blob = uploadedFile;
      filename = uploadedFile.name;
    } else {
      const res = await fetch(currentSample.file);
      blob = await res.blob();
      filename = currentSample.file.split("/").pop();
    }

    // 准备表单
    const fd = new FormData();
    fd.append("audio", blob, filename);
    const s = readSettings(root);
    for (const [k, v] of Object.entries(s)) {
      if (v !== null && v !== undefined && v !== "") fd.append(k, String(v));
    }
    // 把当前任务暴露给用户看（调试用） + 暴露到 window
    if (status) status.textContent = `准备上传… 任务=${s.task} 模型=${s.model} 输出=${s.output_format}`;

    // 初始化 stages 显示
    const stageNames = ["loading", "loading_model", "model_loaded", "transcribing", "done"];
    if (stagesEl) {
      stagesEl.innerHTML = stageNames.map((n) => `<li data-stage="${n}">${stageLabel(n)}</li>`).join("");
    }
    let lastStageIndex = -1;
    const segmentsById = new Map();

    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!response.ok) {
        const text = await response.text();
        throw new Error("HTTP " + response.status + " · " + text);
      }
      if (status) status.textContent = "已连接，等待服务器…";
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let eventName = "message";
      let dataLines = [];

      const flushEvent = () => {
        if (!dataLines.length) { eventName = "message"; return; }
        const payload = dataLines.join("\n");
        try { handleEvent(JSON.parse(payload), eventName, root, status, stagesEl, stageNames, segmentsById, () => lastStageIndex); }
        catch (e) { /* 忽略 */ }
        dataLines = [];
        eventName = "message";
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith("event:")) {
            flushEvent();
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          } else if (line === "") {
            flushEvent();
          }
        }
      }
      flushEvent();
      if (status) status.textContent = "完成。";
    } catch (e) {
      if (status) status.textContent = "错误：" + e.message;
      alert("转写失败：" + e.message + "\n\n确认服务器已启动并安装 openai-whisper（pip install openai-whisper）。");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function stageLabel(name) {
    const map = {
      loading: "加载",
      loading_model: "加载模型",
      model_loaded: "模型就绪",
      transcribing: "转写中",
      done: "完成",
    };
    return map[name] || name;
  }

  function handleEvent(payload, eventName, root, status, stagesEl, stageNames, segmentsById, getLastIdx) {
    if (eventName === "stage") {
      const idx = stageNames.indexOf(payload.stage);
      if (idx >= 0) {
        const items = stagesEl.querySelectorAll("li");
        items.forEach((el, i) => {
          el.classList.remove("active", "done");
          if (i < idx) el.classList.add("done");
          else if (i === idx) el.classList.add("active");
        });
        if (payload.ms) {
          if (status) status.textContent = stageLabel(payload.stage) + " · " + (payload.ms / 1000).toFixed(2) + "s";
        } else if (payload.model) {
          if (status) status.textContent = "加载模型 " + payload.model + "（设备：" + (payload.device || "?") + "）";
        } else {
          if (status) status.textContent = stageLabel(payload.stage);
        }
      }
    } else if (eventName === "segment") {
      segmentsById.set(payload.id, payload);
      renderTranscriptPane(root, Array.from(segmentsById.values()).sort((a, b) => a.id - b.id));
    } else if (eventName === "result") {
      lastResult = payload;
      renderResult(root, payload);
    } else if (eventName === "error") {
      if (status) status.textContent = "错误：" + payload.message;
      alert("服务器报错：" + payload.message);
    } else if (eventName === "exit") {
      // 子进程退出
    }
  }

  function renderTranscriptPane(root, segments) {
    const pane = $('[data-pane="transcript"]', root);
    if (!pane) return;
    if (!segments.length) {
      pane.innerHTML = `<div class="empty-output"><span>未检测到语音。</span></div>`;
      return;
    }
    pane.innerHTML = segments.map((s) => {
      const start = s.start != null ? formatTs(s.start) : "";
      const end = s.end != null ? formatTs(s.end) : "";
      const text = (s.text || "").trim();
      return `<div class="transcript-segment" data-seg-start="${s.start}" data-seg-end="${s.end}">
        <span class="ts">${start} → ${end}</span>
        <span class="text">${escapeHtml(text)}</span>
      </div>`;
    }).join("");
    pane.querySelectorAll("[data-seg-start]").forEach((el) => {
      el.addEventListener("click", () => {
        const start = Number(el.getAttribute("data-seg-start"));
        const audio = $("[data-audio]", root);
        if (audio) {
          audio.currentTime = start;
          audio.play().catch(() => {});
        }
        pane.querySelectorAll(".transcript-segment").forEach((e) => e.classList.remove("active"));
        el.classList.add("active");
        setTimeout(() => el.classList.remove("active"), 1200);
      });
    });
  }

  function renderResult(root, payload) {
    if (payload.format === "json") {
      renderTranscriptPane(root, (payload.result && payload.result.segments) || []);
      // 自动切到 transcript 标签
      setOutputTab("transcript", root);
      // 把 segments / json / raw 都缓存
      lastResult = { format: "json", result: payload.result };
    } else {
      lastResult = { format: payload.format, text: payload.text };
      setOutputTab("raw", root);
    }
    setOutputTab("transcript", root);
    // 启用下载按钮
    root.querySelectorAll("[data-download]").forEach((b) => { b.disabled = false; });
  }

  function setOutputTab(name, root) {
    $all(".output-tabs button", root).forEach((b) => {
      b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name));
    });
    $all(".output-pane", root).forEach((p) => {
      p.hidden = p.getAttribute("data-pane") !== name;
    });
    if (name === "segments" && lastResult && lastResult.format === "json") {
      const pane = $('[data-pane="segments"]', root);
      pane.innerHTML = `<pre class="json">${escapeHtml(JSON.stringify(lastResult.result.segments || [], null, 2))}</pre>`;
    }
    if (name === "json" && lastResult && lastResult.format === "json") {
      const pane = $('[data-pane="json"]', root);
      const summary = { ...lastResult.result };
      if (summary.segments) {
        summary.segments = summary.segments.map((s) => { const { tokens, ...rest } = s; return rest; });
      }
      pane.innerHTML = `<pre class="json">${escapeHtml(JSON.stringify(summary, null, 2))}</pre>`;
    }
    if (name === "raw" && lastResult) {
      const pane = $('[data-pane="raw"]', root);
      const text = lastResult.format === "json"
        ? JSON.stringify(lastResult.result, null, 2)
        : (lastResult.text || "");
      pane.innerHTML = `<pre class="json" data-ext="${lastResult.format}">${escapeHtml(text)}</pre>`;
    }
  }

  function formatTs(seconds) {
    if (seconds == null) return "—";
    const ms = Math.round(seconds * 1000);
    const mm = Math.floor(ms / 60000);
    const ss = Math.floor((ms - mm * 60000) / 1000);
    const mss = ms - mm * 60000 - ss * 1000;
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0") + "." + String(mss).padStart(3, "0");
  }

  // ===== 启动 =====
  function wirePlayground(root) {
    populateControls(root);
    const sid = ($("[name=sample_id]", root) || {}).value;
    if (sid) selectSample(sid, root);
    else if (window.WW_SAMPLES && window.WW_SAMPLES[0]) selectSample(window.WW_SAMPLES[0].id, root);

    $("[name=sample_id]", root).addEventListener("change", (e) => {
      selectSample(e.target.value, root);
    });

    $("#upload", root).addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) onUpload(f, root);
    });

    $("[data-run-btn]", root).addEventListener("click", () => runSimulation(root));

    $all(".output-tabs button", root).forEach((b) => {
      b.addEventListener("click", () => setOutputTab(b.getAttribute("data-tab"), root));
    });

    // 任务切换（转写 / 翻译到英）：写到模块级 currentTask，readSettings 直接读
    $all("[data-task-btn]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        currentTask = btn.getAttribute("data-task-btn");
        $all("[data-task-btn]", root).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        // 选了「翻译到英」时，禁止选 turbo（turbo 不支持翻译）
        const modelSel = $("[name=model]", root);
        if (modelSel) {
          const opt = modelSel.options[modelSel.selectedIndex];
          if (currentTask === "translate" && opt && opt.text && opt.text.startsWith("turbo")) {
            for (let i = 0; i < modelSel.options.length; i++) {
              if (!modelSel.options[i].text.startsWith("turbo")) { modelSel.selectedIndex = i; break; }
            }
          }
        }
      });
    });

    // 下载按钮
    $all("[data-download]", root).forEach((btn) => {
      btn.addEventListener("click", () => downloadFile(btn.getAttribute("data-download"), root));
    });
  }

  // ===== 下载 =====
  function plainTextFromResult(result) {
    if (!result || !result.segments || !result.segments.length) return "";
    return result.segments
      .map((s) => (s.text || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  function timestamped() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function downloadFile(format, root) {
    if (!lastResult) {
      alert("还没有结果。先点 ▶ 运行。");
      return;
    }

    let content = "";
    let mime = "text/plain;charset=utf-8";
    let ext = format;
    const baseName = `whisper-${timestamped()}`;

    if (format === "txt") {
      // 纯文本：仅文字，空格拼接，无任何元数据
      const r = lastResult.format === "json" ? lastResult.result : null;
      content = r ? plainTextFromResult(r) : (lastResult.text || "");
      mime = "text/plain;charset=utf-8";
    } else if (format === "json") {
      if (lastResult.format !== "json") {
        alert("当前结果不是 JSON 格式（来自 " + lastResult.format + " 输出）。切到「原始」标签可以查看内容。");
        return;
      }
      content = JSON.stringify(lastResult.result, null, 2);
      mime = "application/json;charset=utf-8";
    } else if (format === "vtt" || format === "srt" || format === "tsv" || format === "jsonl") {
      if (lastResult.format !== "json" || !lastResult.result) {
        alert("需要 JSON 格式的结果才能导出 " + format.toUpperCase() + "。在「运行」前把输出格式选成 " + format.toUpperCase() + " 再跑一次，或在「原始」标签查看当前内容。");
        return;
      }
      // 用 simulator 的 writer（它的 writeFor 接口接受任意 segments 形状）
      if (!window.WW_SIM || !window.WW_SIM.writeFor) {
        alert("下载器未加载。");
        return;
      }
      content = window.WW_SIM.writeFor(format, lastResult.result);
      if (format === "tsv") mime = "text/tab-separated-values;charset=utf-8";
      else if (format === "vtt") mime = "text/vtt;charset=utf-8";
      else if (format === "srt") mime = "application/x-subrip;charset=utf-8";
      else if (format === "jsonl") mime = "application/x-ndjson;charset=utf-8";
    } else {
      return;
    }

    // BOM 让 Windows 记事本正确识别 UTF-8
    const blob = new Blob(["﻿" + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }

  function initPlayground() {
    const root = document.querySelector("[data-playground]");
    if (!root) return;
    wirePlayground(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlayground);
  } else {
    initPlayground();
  }

  window.WW_playground = { runSimulation };
})();
