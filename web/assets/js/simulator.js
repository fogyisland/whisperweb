// Simulator — drives the visual stages of a Whisper transcribe() pipeline
// against pre-generated JSON, producing realistic-looking output without
// running real inference.
//
// Pipeline stages mirror transcribe.py: load audio -> log_mel -> lang detect -> decode (windows) -> word ts -> writer

(function () {
  "use strict";

  // Approximate stage durations per model (seconds). Calibrated to the README speed_x table
  // — tiny/turbo fast; large-v3 slow. These are UI time-savers, not real benchmarks.
  function modelProfile(modelId) {
    const speed = {
      "tiny.en": 10, tiny: 10,
      "base.en": 7, base: 7,
      "small.en": 4, small: 4,
      "medium.en": 2, medium: 2,
      "large-v1": 1, "large-v2": 1, "large-v3": 1,
      turbo: 8,
    }[modelId] || 5;
    // Smaller speed = slower. base duration per stage.
    const scale = 5 / speed; // tiny=0.5, base~0.7, small~1.25, medium~2.5, large~5, turbo~0.625
    return {
      per_window_ms: Math.round(800 * scale), // mel + decode one 30s window
      per_word_ts_ms: 40,                     // DTW alignment cost
      lang_detect_ms: 200,
      load_ms: 200,
      write_ms: 80,
    };
  }

  // Pick the JSON entry for the current settings. Falls back to English, then to the first available.
  function pickResult(sample, params) {
    const r = sample.results || {};
    if (params.language && r[params.language]) return r[params.language];
    // Auto-detect path: prefer en, then first key.
    if (r.en) return r.en;
    const firstKey = Object.keys(r)[0];
    return firstKey ? r[firstKey] : null;
  }

  // Build language_probs for the "Auto-detect" display: take the result's language_probs and merge.
  function langStripFor(result, topN) {
    topN = topN || 6;
    if (!result || !result.language_probs) return [];
    return Object.entries(result.language_probs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
  }

  // Apply light variation to a base result based on temperature / beam_size, so
  // that the user sees the playground react to parameter changes.
  // For the first slice, we keep this deterministic and gentle: higher temperature
  // adds a few extra "uncertain" words; beam_size mostly just changes the headline
  // metadata; word_timestamps on/off controls whether words are returned.
  function variant(base, params) {
    const out = JSON.parse(JSON.stringify(base));
    out.temperature = params.temperature || 0.0;
    out.beam_size = params.beam_size || null;
    out.best_of = params.best_of || null;

    if (!params.word_timestamps) {
      // Strip word_timestamps out of segments if disabled
      out.segments = out.segments.map((s) => {
        const copy = { ...s };
        delete copy.words;
        return copy;
      });
    } else {
      // Inject word_timestamps into segments if we have a separate map.
      const map = base.word_timestamps || {};
      out.segments = out.segments.map((s) => {
        const words = (map[s.id] || []).map(([w, st, en, p]) => ({
          word: w, start: st, end: en, probability: p,
        }));
        return { ...s, words };
      });
    }

    return out;
  }

  // Formatters (mirroring utils.py + Write* classes)
  function formatTimestamp(seconds, opts) {
    opts = opts || {};
    let ms = Math.round(seconds * 1000);
    const hh = Math.floor(ms / 3600000);
    ms -= hh * 3600000;
    const mm = Math.floor(ms / 60000);
    ms -= mm * 60000;
    const ss = Math.floor(ms / 1000);
    ms -= ss * 1000;
    const hoursPart = (opts.always_include_hours || hh > 0) ? String(hh).padStart(2, "0") + ":" : "";
    const dec = opts.decimal_marker || ".";
    return `${hoursPart}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}${dec}${String(ms).padStart(3, "0")}`;
  }

  function writeTxt(result) {
    return (result.segments || []).map((s) => (s.text || "").trim()).filter(Boolean).join("\n");
  }

  function writeVtt(result) {
    let out = "WEBVTT\n\n";
    (result.segments || []).forEach((s, i) => {
      const start = formatTimestamp(s.start, { decimal_marker: "." });
      const end = formatTimestamp(s.end, { decimal_marker: "." });
      const text = (s.text || "").trim().replace(/-->/g, "->");
      if (!text) return;
      out += `${start} --> ${end}\n${text}\n\n`;
    });
    return out;
  }

  function writeSrt(result) {
    let out = "";
    let n = 0;
    (result.segments || []).forEach((s) => {
      const text = (s.text || "").trim().replace(/-->/g, "->");
      if (!text) return;
      n += 1;
      const start = formatTimestamp(s.start, { always_include_hours: true, decimal_marker: "," });
      const end = formatTimestamp(s.end, { always_include_hours: true, decimal_marker: "," });
      out += `${n}\n${start} --> ${end}\n${text}\n\n`;
    });
    return out;
  }

  function writeTsv(result) {
    let out = "start\tend\ttext\n";
    (result.segments || []).forEach((s) => {
      const text = (s.text || "").trim().replace(/\t/g, " ");
      out += `${Math.round(s.start * 1000)}\t${Math.round(s.end * 1000)}\t${text}\n`;
    });
    return out;
  }

  function writeJson(result) { return JSON.stringify(result, null, 2); }
  function writeJsonl(result) {
    return (result.segments || []).map((s) => JSON.stringify(s)).join("\n");
  }

  function writeFor(format, result) {
    switch (format) {
      case "txt": return writeTxt(result);
      case "vtt": return writeVtt(result);
      case "srt": return writeSrt(result);
      case "tsv": return writeTsv(result);
      case "json": return writeJson(result);
      case "jsonl": return writeJsonl(result);
      default: return writeTxt(result);
    }
  }

  // Run the simulation. callbacks is an object with:
  //   onStage(name) — stage entered
  //   onDone(result, writtenOutput, format)
  //   onError(err)
  function run(sample, params, callbacks) {
    callbacks = callbacks || {};
    const profile = modelProfile(params.model || "base");
    const stages = [
      { name: "加载音频",                 ms: profile.load_ms },
      { name: "计算 log-Mel 谱图",        ms: 350 },
      { name: "检测语言",                 ms: profile.lang_detect_ms },
      { name: "解码（滑动窗口）",         ms: profile.per_window_ms },
    ];
    if (params.word_timestamps) {
      stages.push({ name: "对齐词级时间戳（交叉注意力 + DTW）", ms: 220 });
    }
    stages.push({ name: `写出输出（${params.output_format || "txt"}）`, ms: profile.write_ms });

    let i = 0;
    function next() {
      if (i >= stages.length) {
        const base = pickResult(sample, params);
        if (!base) {
          if (callbacks.onError) callbacks.onError(new Error("没有可用的样本结果"));
          return;
        }
        const result = variant(base, params);
        const text = writeFor(params.output_format || "txt", result);
        if (callbacks.onDone) callbacks.onDone(result, text, params.output_format || "txt");
        return;
      }
      const s = stages[i++];
      if (callbacks.onStage) callbacks.onStage(s.name, s.ms);
      setTimeout(next, s.ms);
    }
    next();
  }

  window.WW_SIM = { run, formatTimestamp, writeFor, langStripFor, modelProfile };
})();
