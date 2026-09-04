# Whisper 中文手册

Whisper 中文手册 = 静态前端 + Node.js 服务 + Python 推理后端。

## 功能

- **运行平台**（音频 → 文字）：上传音频，跑真实 Python Whisper 推理，SSE 实时流回结果。点转写行跳音频，可下载纯文本 / JSON / WebVTT / SRT / TSV / JSONL 六种格式。支持「转写」和「翻译到英」两种 Whisper 原生任务。
- **命令行生成器**：勾选参数生成 `whisper ...` 命令，可复制或在服务器运行。
- **下载模型权重**：tiny / small / large-v3 三个代表尺寸一键下载。
- **输出格式切换**、**语言列表**、**Python 健康徽章** 等工具页。

## 启动

```
Windows：双击 start.bat
macOS / Linux：./start.sh
```

首次启动会：
1. 检测 GPU（`nvidia-smi` 在 → CUDA，否则 CPU）
2. 自动创建 `venv/`（从项目内置 `python/` 创建）
3. 安装 PyTorch（CUDA 12.6 ~2.5 GB 或 CPU ~200 MB）+ openai-whisper
4. 启动 Node + 浏览器

无需预装任何东西（Node 和 Python 都内置在项目里）。`ffmpeg` 仍需系统装（Windows 用 `choco install ffmpeg`，macOS `brew install ffmpeg`）。

可强制模式：`WHISPER_DEVICE=cuda` 或 `=cpu`。

## 目录结构

```
├── web/                 前端（7 个 HTML + 7 个 JS + 4 个 CSS）
├── node/                内置 Node.js 22 LTS portable
├── python/              内置 Python 3.12 portable（用于创建 venv）
├── server.js            Node HTTP 服务
├── whisper_runner.py    Python Whisper 推理包装
├── venv/                首次启动自动创建（PyTorch + openai-whisper）
├── models/whisper/      Whisper 权重（首次按需下载）
├── start.bat / start.sh 一键启动
├── DEPLOY.md            部署文档
└── README.md            本文件
```

## 接口

- `GET /` 静态首页
- `GET /api/health` JSON 服务状态
- `GET /api/download/<id>` 模型权重代理
- `POST /api/transcribe` multipart + SSE 流，跑 Whisper
   - `task=transcribe`（默认）或 `task=translate`（X 语种音频 → 英文文字）

## 模型权重位置

`models/whisper/`（项目根目录下的子目录）。Whisper 自动从这里读；首次运行时若缺失则下载到这里。

预放进去的：`tiny.pt`（75 MB）、`tiny.en.pt`（75 MB）、`turbo.pt`（1.5 GB）。`small.pt`、`medium.pt`、`large-v3.pt` 需要时自动下载。

## 跨平台

同一份 `publish/` 在 Windows / macOS / Linux 上都能跑（macOS/Linux 用 `start.sh`，依赖系统 Node 18+）。

## 协议

基于 [OpenAI Whisper](https://github.com/openai/whisper) · MIT
