// Whisper 中文手册 —— 静态服务器 + 模型下载代理 + Python Whisper 推理。
//
// 端点：
//   GET  /                                静态首页
//   GET  /<file>                          静态文件
//   GET  /api/download/<tiny|small|...>   模型权重下载（代理 OpenAI CDN）
//   POST /api/transcribe                  跑 Python whisper_runner.py，SSE 流回进度与结果
//
// 启动：node server.js  （端口 8765，可由 PORT 改；Python 路径可由 PYTHON 改）
//
// 平台：纯 Node.js 内置模块，Windows / macOS / Linux 通用。Python 启动器默认试
//   python3 → python → py（Windows）。

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "web");
const PORT = Number(process.env.PORT || 8765);

// 三个代表模型的下载源。
const MODEL_URLS = {
  "tiny":      "https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt",
  "small":     "https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt",
  "medium":    "https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt",
  "large-v3":  "https://openaipublic.azureedge.net/main/whisper/models/e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb/large-v3.pt",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".flac": "audio/flac",
  ".wav":  "audio/wav",
  ".mp3":  "audio/mpeg",
  ".pt":   "application/octet-stream",
};

// ===== 启动器探测 =====
function findPython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const candidates = process.platform === "win32"
    ? ["python", "python3", "py"]
    : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ["--version"], { stdio: "ignore" });
      if (r.status === 0) return cmd;
    } catch (_) { /* ignore */ }
  }
  return null;
}
const PYTHON = findPython();
const RUNNER = path.join(__dirname, "whisper_runner.py");

// ===== 模型下载代理 =====
function proxyDownload(id, req, res) {
  const url = MODEL_URLS[id];
  if (!url) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("未知模型：" + id);
    return;
  }
  console.log("[proxy] " + id + " <- " + url);
  https.get(url, { headers: { "User-Agent": "WhisperWeb/1.0" } }, (upstream) => {
    if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
      proxyDownload(id, req, res);
      upstream.resume();
      return;
    }
    if (upstream.statusCode !== 200) {
      res.writeHead(upstream.statusCode || 502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("上游返回 HTTP " + upstream.statusCode);
      return;
    }
    const headers = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${id}.pt"`,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    };
    if (upstream.headers["content-length"]) headers["Content-Length"] = upstream.headers["content-length"];
    res.writeHead(200, headers);
    upstream.pipe(res);
    upstream.on("error", (e) => {
      console.error("[proxy] upstream error:", e.message);
      try { res.destroy(); } catch (_) {}
    });
  }).on("error", (e) => {
    console.error("[proxy] request error:", e.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("代理错误：" + e.message);
    }
  });
}

// ===== 简易 multipart/form-data 解析器 =====
// 仅支持单文件 + 文本字段，足够我们这个端点用。
function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const buf = Buffer.concat(chunks);
        const sep = Buffer.from("--" + boundary);
        const parts = [];
        let pos = 0;
        while (pos < buf.length) {
          const start = buf.indexOf(sep, pos);
          if (start === -1) break;
          const headEnd = buf.indexOf("\r\n\r\n", start);
          if (headEnd === -1) break;
          const headerText = buf.slice(start + sep.length + 2, headEnd).toString("utf8");
          const nextSep = buf.indexOf(sep, headEnd + 4);
          const bodyEnd = nextSep === -1 ? buf.length : nextSep - 2;
          const body = buf.slice(headEnd + 4, bodyEnd);
          const nameMatch = headerText.match(/name="([^"]+)"/);
          const filenameMatch = headerText.match(/filename="([^"]+)"/);
          const ctMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
          parts.push({
            name: nameMatch ? nameMatch[1] : null,
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: ctMatch ? ctMatch[1].trim() : null,
            data: body,
          });
          pos = nextSep === -1 ? buf.length : nextSep;
        }
        resolve(parts);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ===== /api/transcribe —— SSE 流 =====
function handleTranscribe(req, res) {
  if (!PYTHON) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Python 不可用。先安装 Python 3.8+ 与 openai-whisper。" }));
    return;
  }
  const ct = req.headers["content-type"] || "";
  const m = ct.match(/^multipart\/form-data;\s*boundary=(.+)$/);
  if (!m) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "需要 multipart/form-data 请求" }));
    return;
  }
  parseMultipart(req, m[1]).then(async (parts) => {
    const filePart = parts.find((p) => p.filename);
    const fields = {};
    parts.forEach((p) => { if (!p.filename && p.name) fields[p.name] = p.data.toString("utf8"); });
    if (!filePart) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "缺少音频文件" }));
      return;
    }

    // 把上传的音频写到临时文件
    const tmpPath = path.join(os.tmpdir(), `ww-${Date.now()}-${filePart.filename || "audio"}`);
    fs.writeFileSync(tmpPath, filePart.data);

    // 组装参数
    const argv = [
      RUNNER,
      "--input", tmpPath,
      "--model", fields.model || "turbo",
      "--task", fields.task || "transcribe",
      "--output-format", fields.output_format || "json",
    ];
    if (fields.language) argv.push("--language", fields.language);
    if (fields.temperature) argv.push("--temperature", fields.temperature);
    if (fields.beam_size) argv.push("--beam-size", fields.beam_size);
    if (fields.best_of) argv.push("--best-of", fields.best_of);
    if (fields.initial_prompt) argv.push("--initial-prompt", fields.initial_prompt);
    if (fields.word_timestamps === "true" || fields.word_timestamps === "1") argv.push("--word-timestamps");
    if (fields.fp16 === "false" || fields.fp16 === "0") argv.push("--no-fp16");

    console.log("[transcribe] " + PYTHON + " " + argv.join(" "));

    // SSE 头
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const child = spawn(PYTHON, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    const sendEvent = (obj) => {
      const name = obj.event || "message";
      res.write("event: " + name + "\n");
      res.write("data: " + JSON.stringify(obj).replace(/\n/g, " ") + "\n\n");
    };

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try { sendEvent(JSON.parse(line)); }
        catch (e) { /* 忽略非 JSON 行 */ }
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      process.stderr.write("[whisper_runner] " + text);
    });
    child.on("close", (code) => {
      if (buf.trim()) {
        try { sendEvent(JSON.parse(buf)); } catch (_) {}
      }
      sendEvent({ event: "exit", code });
      res.end();
      // 清理临时文件
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    });
    child.on("error", (err) => {
      sendEvent({ event: "error", message: err.message });
      res.end();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    });

    // 客户端断开时杀掉子进程
    req.on("close", () => {
      try { child.kill(); } catch (_) {}
    });
  }).catch((err) => {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "解析失败：" + err.message }));
  });
}

// ===== 静态文件 =====
function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const fullPath = path.join(ROOT, rel);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found: " + rel);
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

// ===== 路由 =====
const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }
  const url = req.url.split("?")[0];
  const dl = url.match(/^\/api\/download\/([\w.-]+)$/);
  if (dl && req.method === "GET") return proxyDownload(dl[1], req, res);
  if (url === "/api/transcribe" && req.method === "POST") return handleTranscribe(req, res);
  if (url === "/api/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      python: PYTHON || null,
      whisper_runner: fs.existsSync(RUNNER),
      platform: process.platform,
      node: process.version,
    }));
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Whisper 中文手册: http://localhost:${PORT}/`);
  console.log(`Python: ${PYTHON || "（未检测到）"}`);
  console.log(`Runner: ${RUNNER}`);
});
