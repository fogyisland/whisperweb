# 集成指南

把 Whisper 中文手册嵌入你自己的软件时，有 **4 种集成模式**，按耦合度从低到高：

| 模式 | 用谁的代码 | 适合 |
|---|---|---|
| **A. 嵌入前端** | 只用 `web/` 静态文件 | 软件已经有自己的后端，缺一个 Whisper UI |
| **B. 调用 HTTP API** | `web/` + `server.js` + Python 后端 | 软件有自己的 UI 框架但想省事用现成页面 |
| **C. 直接调 Python** | `whisper_runner.py` 或 `import whisper` | 软件是 Python 项目，想用 Whisper 但不需要页面 |
| **D. 跑命令行** | `whisper` CLI 或 `whisper_runner.py` | 软件是构建管道 / 批处理，不需要长期运行的进程 |

下面分别讲。

---

## 模式 A — 嵌入前端

只拿 `web/` 目录（9 KB 7 个 HTML，6 KB 7 个 JS，4 KB 4 个 CSS）放到你自己的服务器上。  
要求：你的服务器在 `http://your-app/...` 暴露后端 API（按模式 B 部署 Whisper 后端）。

适用：你做的是 SaaS，想加个 Whisper 子页面但不想自己写。

**集成步骤**：
1. 把 `web/` 拷到你的静态资源目录
2. 改 `assets/js/health.js` 里的 `fetch("/api/health")` 改成你的后端 URL
3. 改 `assets/js/playground.js` 里的 `fetch("/api/transcribe", ...)` 改成你的 URL
4. 改所有 HTML 的 nav 链接

成本：~30 KB 代码修改量。

---

## 模式 B — 调用 HTTP API

完整部署整个项目，你只需改一个端口。

适用：你不想写后端 / 想省事。

**集成步骤**：
1. 把整个 `D:\ToolDevelop\whisperweb\` 拷到目标机器
2. 改 `server.js` 里的 `const PORT = Number(process.env.PORT || 8765);` 设你想要的端口
3. 双击 `start-gpu.bat`（NVIDIA 卡）或 `start-cpu.bat`（无 GPU / 想省空间）
4. 前端地址：`http://<目标机器>:<端口>/`

**反向代理（推荐）**：让 nginx / Apache 把 `/whisper/*` 路径转发到 8765：

```nginx
location /whisper/ {
    proxy_pass http://127.0.0.1:8765/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # SSE 必须
    proxy_read_timeout 86400;
}
```

**CORS**：默认同源无问题。如果前端跨域（如 `https://app.example.com` → `http://api.example.com:8765`），`server.js` 已经有 `Access-Control-Allow-Origin: *`，可直接用。

**调用 SSE**：

```javascript
async function transcribe(audioFile, model = "turbo") {
  const fd = new FormData();
  fd.append("audio", audioFile);
  fd.append("model", model);
  fd.append("output_format", "json");
  const response = await fetch("http://api:8765/api/transcribe", { method: "POST", body: fd });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    // 解析 SSE：event: xxx\ndata: {...}\n\n
    // ...
  }
}
```

完整事件协议：`stage` / `segment` / `result` / `error` / `exit`，详见 `whisper_runner.py` 顶部注释。

---

## 模式 C — 直接调 Python

你的软件本身是 Python 项目。直接用 `openai-whisper`，跳过我们的 web 层。

### 方案 C1：用 `whisper_runner.py` 作为子进程

你的代码：
```python
import subprocess, json

def transcribe(audio_path, model="turbo"):
    proc = subprocess.run(
        ["venv/Scripts/python.exe", "whisper_runner.py",
         "--input", audio_path, "--model", model, "--output-format", "json"],
        capture_output=True, text=True, cwd="/path/to/whisperweb"
    )
    for line in proc.stdout.splitlines():
        if not line.strip(): continue
        evt = json.loads(line)
        if evt["event"] == "result":
            return evt["result"]
        elif evt["event"] == "error":
            raise RuntimeError(evt["message"])
```

适合：想拿到分段级输出（带 word_timestamps），但不想自己写进度回调。

### 方案 C2：直接 `import whisper`

```python
import whisper

model = whisper.load_model("turbo", device="cuda")  # 或 "cpu"
result = model.transcribe("audio.mp3", language="zh", word_timestamps=True)

for seg in result["segments"]:
    print(f"[{seg['start']:.2f} → {seg['end']:.2f}] {seg['text']}")
```

**省事**，但失去了 SSE 实时回传的好处（要等整个音频处理完）。

**CPU / GPU 切换**：
```python
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
model = whisper.load_model("turbo", device=device)
```

**模型缓存目录**：如果你想用我们项目的 `models/whisper/` 目录：
```python
model = whisper.load_model("turbo", download_root="./models/whisper")
```

---

## 模式 D — 跑命令行

最简单的集成——作为批处理步骤调用。

**方案 D1：官方 whisper CLI**
```bash
venv/Scripts/python.exe -m whisper audio.mp3 --model turbo --output_format json
```

**方案 D2：用我们包装的 `whisper_runner.py`**（输出 JSON Lines 进度，更适合管道消费）
```bash
venv/Scripts/python.exe whisper_runner.py --input audio.mp3 --model turbo --output-format json | \
  jq -c 'select(.event == "segment") | {start, end, text}'
```

**方案 D3：装到系统 PATH**
```bash
# 安装 openai-whisper 到系统 Python
pip install openai-whisper
# 命令行直接用
whisper audio.mp3 --model turbo
```

---

## CPU vs GPU 选择

| 维度 | CPU | GPU（NVIDIA） |
|---|---|---|
| 启动包大小 | ~200 MB | ~2.5 GB |
| tiny 11 秒音频 | 3–5 秒 | 0.3 秒 |
| small 11 秒音频 | 15–30 秒 | 1.5 秒 |
| large-v3 11 秒音频 | 5–10 分钟 | 20 秒 |
| 兼容性 | 任何机器 | 必须 NVIDIA 显卡 + 驱动 |

**用户在你的软件里选哪个**：
- 给用户两个入口：<kbd>start-cpu.bat</kbd> 和 <kbd>start-gpu.bat</kbd>
- 你的安装器探测 NVIDIA：在「高级设置」勾选 GPU，否则 CPU
- 服务器端 / 离线批处理：默认 CPU（简单），用户主动加 GPU

**Windows 启动脚本已经做了这个分流**：
- `start-cpu.bat` → 强制装 CPU torch（200 MB）
- `start-gpu.bat` → 验证 nvidia-smi 后装 CUDA torch（2.5 GB）
- `start.bat` → 自动探测（默认）
- `start.sh` → Linux/macOS 自动探测

环境变量 `WHISPER_DEVICE=cuda` / `=cpu` 可在 Linux 上强制。

---

## 部署清单

### 最小（模式 A）—— 30 KB
- `web/` 全部

### 完整前端 + 后端（模式 B）—— ~250 MB
- `web/` + `node/`（内置 Node 22 LTS）
- `server.js`
- 用户机器还要装：`ffmpeg`（whisper 的依赖）

### 加上 Python Whisper（模式 B/C/D）—— +150 MB
- 上述 + `python/`（内置 Python 3.12 portable）
- 用户跑 `start-cpu.bat` 或 `start-gpu.bat` 装 venv
- 首次跑：CPU 200 MB / GPU 2.5 GB

### 加上模型权重（可选）
- 第一次跑转写时按需下载
- `models/whisper/` 目录，git 忽略

### 自定义 Logo / 文案
- `web/assets/css/tokens.css` —— 主色、字体、间距全在这里
- `web/index.html` / `playground.html` / `cli.html` —— 标题、说明
- 重新跑 `python/whisper_runner.py --input` 不受影响

---

## 跨平台

| 文件 | Windows | macOS / Linux |
|---|---|---|
| `start-cpu.bat` / `start-gpu.bat` | ✓ | — |
| `start.sh` | （Git Bash / WSL） | ✓ |
| `web/` | ✓ | ✓ |
| `node/` | x64 portable | 需要 tar.gz，详见 DEPLOY.md |
| `python/` | x64 embed | 需要 tar.gz，详见 DEPLOY.md |
| `server.js` | ✓ | ✓ |
| `whisper_runner.py` | ✓ | ✓ |

要在 macOS / Linux 上用同样的 portable 体验：手动下载 `python-build-standalone` 的 macOS arm64 / x86_64 build 和 Linux build 到 `python/`。

---

## 常见问题

**Q: 我的用户机器上没装 ffmpeg，会怎样？**
A: whisper 需要它解码音频。下载页有 ffmpeg 缺失诊断。Windows 一行装：`choco install ffmpeg`，macOS：`brew install ffmpeg`。

**Q: 同时跑两个实例会冲突吗？**
A: 会，占同一个 8765 端口。改 `server.js` 里的 `PORT` 即可，或用 `PORT=8766 node server.js`。

**Q: 集成到 Electron / Tauri / Wails 这种桌面壳里行吗？**
A: 行。把整个项目当后端服务跑（spawn `start-cpu.bat` 或 `start-gpu.bat`），Electron / Tauri 用 iframe / webview 加载 `http://localhost:8765/`。

**Q: 我的软件是 SaaS 部署在云上，能直接 npm install 然后跑吗？**
A: Node 部分（`server.js`）可以纯 npm 部署；但 `whisper_runner.py` 需要 Python 3.8+ 和 openai-whisper。建议方案：在 Docker 镜像里跑完整栈。最小 Dockerfile：
```dockerfile
FROM node:18-slim
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg
WORKDIR /app
COPY . .
RUN python3 -m venv venv
RUN venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cu126
RUN venv/bin/pip install openai-whisper
EXPOSE 8765
CMD ["node", "server.js"]
```

---

## 完整文件清单（git 跟踪）

```
.gitignore
DEPLOY.md
INTEGRATION.md          ← 本文件
README.md
package.json
requirements.txt
server.js               ← Node HTTP 服务
whisper_runner.py       ← Python Whisper 包装
start.bat               ← Windows 自动探测
start-cpu.bat           ← Windows 强制 CPU
start-gpu.bat           ← Windows 强制 GPU
start.sh                ← Linux/macOS 自动探测
node/                   ← 内置 Node 22 LTS portable
python/                 ← 内置 Python 3.12 portable
web/                    ← 前端（HTML + CSS + JS）
```

---

许可：基于 [OpenAI Whisper](https://github.com/openai/whisper) · MIT
