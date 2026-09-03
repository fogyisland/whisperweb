# 部署文档

Whisper 中文手册 = 静态前端（`web/`）+ Node.js 服务（`server.js`）+ Python Whisper 后端（`whisper_runner.py`）。

## 一、依赖

### 通用
- **Node.js ≥ 18**
- **Python ≥ 3.8**（推荐 3.10/3.11）
- **ffmpeg**（系统可执行文件）
- **pip install openai-whisper**

### Linux（Ubuntu/Debian）
```bash
sudo apt update
sudo apt install -y python3 python3-pip ffmpeg nodejs npm
pip3 install openai-whisper
```

### macOS
```bash
brew install python@3.10 ffmpeg node
pip3 install openai-whisper
```

### Windows
```powershell
# 用 choco 一行装齐
choco install python ffmpeg nodejs
pip install openai-whisper
```

或手动：
- Python: <https://www.python.org/downloads/>（勾选「Add to PATH」）
- ffmpeg: <https://www.gyan.dev/ffmpeg/builds/> → 解压，把 `bin/` 加到 PATH
- Node.js: <https://nodejs.org/>
- 然后：`pip install openai-whisper`

## 二、启动

```bash
cd D:\ToolDevelop\whisperweb          # 或 Linux/macOS 上的对应路径
node server.js
```

启动成功会看到：
```
Whisper 中文手册: http://localhost:8765/
Python: python                        # Windows 路径
Runner: D:\...\whisper_runner.py
```

**首次跑转写时**，Whisper 会自动从 `~/.cache/whisper/`（Linux）或 `%USERPROFILE%\.cache\whisper\`（Windows）下载模型权重。`tiny` 约 75 MB，几秒就好；`large-v3` 约 2.9 GB。

## 三、端到端验证

### 1. 静态页能开
浏览器打开 `http://localhost:8765/`，应该看到首页。

### 2. Python 启动器能跑
```bash
python D:\ToolDevelop\whisperweb\whisper_runner.py --help
```
应当看到 argparse 帮助文本，没有 ImportError。

### 3. /api/health 端点能通
```bash
curl http://localhost:8765/api/health
```
返回 JSON：
```json
{"ok":true,"python":"python","whisper_runner":true,"platform":"win32","node":"v18.x.x"}
```

### 4. 转写能跑通
- 浏览器打开 `http://localhost:8765/playground.html`
- 模型选 `tiny`
- 点 ▶ 运行
- 应看到 stage 进度条一段段亮起，最后输出 JFK 转写结果

或打开 `http://localhost:8765/cli.html`，滚到「命令行生成器」，点「在服务器运行」。

## 四、CPU vs GPU

| 设备 | tiny 速度 | large-v3 速度 |
|---|---|---|
| CPU（现代笔记本） | ~10× 实时 | ~1× 实时 |
| GPU（A100） | ~100× 实时 | ~10× 实时 |

CPU 上跑 10 秒音频，large-v3 约 10–30 秒。tiny 几乎实时。GPU 自动检测：CUDA 可用时自动切换。

## 五、部署到云

### Railway / Render / Zeabur 等 PaaS
- 仓库根目录已有 `package.json`，`npm start` 自动启动
- 需在平台环境变量设 `PYTHON=python3`
- 平台需要装好 ffmpeg + pip install openai-whisper（用 `nixpacks.toml` 或 `Dockerfile`）

### Docker（最通用）
```dockerfile
FROM node:18-slim
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir openai-whisper
WORKDIR /app
COPY . .
EXPOSE 8765
CMD ["node", "server.js"]
```

### 自建 Linux VPS
```bash
# nginx 反代
location / {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # SSE 必须
    proxy_read_timeout 86400;     # 大音频长转写
}

# systemd 服务
[Service]
ExecStart=/usr/bin/node /opt/whisper-web/server.js
Restart=always
Environment=PORT=8765
```

## 六、常见问题

**Q: Python 没装但服务能起来吗？**
A: 能。静态页和模型下载照常工作。只有 `/api/transcribe` 会返回 503。

**Q: 启动报「Python 不可用」？**
A: 服务会按 `python3 → python → py` 顺序探测。Linux 上若装了 Python 但叫别的名字，设环境变量 `PYTHON=python3.x`。

**Q: 第一次跑 Whisper 报「找不到模型」？**
A: 正常。第一次会自动下载到 `~/.cache/whisper/`。检查磁盘空间：tiny 75 MB，small 466 MB，medium 1.5 GB，large-v3 2.9 GB。

**Q: SSE 在 nginx 后面断了？**
A: 上面 nginx 配置加了 `proxy_buffering off` 和长 `proxy_read_timeout`。没加的话 SSE 会被 nginx 缓冲掉。

**Q: 大音频上传超时？**
A: 默认无大小限制。若遇 nginx `client_max_body_size` 限制，加一行：
```nginx
client_max_body_size 500m;
```

**Q: 想换端口？**
A: 环境变量 `PORT=3000 node server.js`，或设系统环境变量。
