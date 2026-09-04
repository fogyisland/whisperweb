#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  Whisper 中文手册"
echo "  启动中，浏览器即将自动打开"
echo "============================================"
echo

# ============ 1. Node ============
if [ -x "./node/node.exe" ]; then
  NODE="./node/node.exe"
  echo "[ok] 使用内置 Node.js"
else
  if command -v node >/dev/null 2>&1; then
    NODE="node"
    echo "[ok] 使用系统 Node.js"
  else
    echo "[error] 未检测到 Node.js。请安装 Node.js 18+:"
    echo "        https://nodejs.org/"
    exit 1
  fi
fi

# ============ 2. Python（优先用项目内 portable 版本）============
if [ -x "./python/bin/python3" ]; then
  PYTHON_BIN="$(pwd)/python/bin/python3"
  echo "[ok] 使用内置 Python: $PYTHON_BIN"
else
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
    echo "[ok] 使用系统 Python"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
    echo "[ok] 使用系统 Python"
  else
    echo "[error] 未检测到 Python。需要 portable Python（项目内 python/）"
    echo "        或系统 Python 3.8+"
    exit 1
  fi
fi

# ============ 3. 决定模式（GPU / CPU）============
# 优先级：WHISPER_DEVICE 环境变量 > nvidia-smi 探测 > 默认 CPU

DEVICE="${WHISPER_DEVICE:-cpu}"

if [ -z "${WHISPER_DEVICE:-}" ]; then
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    DEVICE="cuda"
    echo "[info] 检测到 NVIDIA GPU → CUDA 模式"
  else
    echo "[info] 未找到 nvidia-smi → CPU 模式"
  fi
else
  echo "[info] WHISPER_DEVICE=$DEVICE（用户强制）"
fi

# ============ 4. venv ============
if [ ! -x "venv/bin/python" ]; then
  echo "[step] 创建 Python 虚拟环境 venv/ ..."
  $PYTHON_BIN -m venv venv
  echo "[ok] venv 已创建"
fi

# 检查 torch 是否就绪
if ! venv/bin/python -c "import torch" >/dev/null 2>&1; then
  echo "[step] 升级 pip ..."
  venv/bin/pip install --upgrade pip -q

  if [ "$DEVICE" = "cuda" ]; then
    echo "[step] 安装 PyTorch CUDA 12.6（约 2.5 GB）..."
    venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cu126
  else
    echo "[step] 安装 PyTorch CPU 版（约 200 MB）..."
    venv/bin/pip install torch
  fi

  echo "[step] 安装 openai-whisper ..."
  venv/bin/pip install openai-whisper
  echo "[ok] 依赖装好"
else
  echo "[ok] venv 已就绪（$DEVICE 模式）"
fi

# 显示实际状态
venv/bin/python -c "
import torch
v = torch.__version__
ok = torch.cuda.is_available()
print(f'    torch {v} | cuda: {ok}', '|', torch.cuda.get_device_name() if ok else 'CPU 推理')
"

# ============ 5. 启动 ============
export PYTHON="$(pwd)/venv/bin/python"
export WHISPER_DEVICE="$DEVICE"
"$NODE" server.js &
NODE_PID=$!
echo "Node 服务 PID: $NODE_PID"
echo "推理模式: $DEVICE"

cleanup() {
  kill $NODE_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

sleep 2

URL="http://localhost:8765/"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
else
  echo "[提示] 浏览器无法自动打开，请手动访问 $URL"
fi

echo
echo "============================================"
echo "  已启动 $URL"
echo "  推理模式: $DEVICE"
echo "  Ctrl+C 停止服务"
echo "============================================"

wait $NODE_PID