#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  Whisper 中文手册"
echo "  启动中，浏览器即将自动打开"
echo "============================================"
echo

# 检查 Node
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js。请先安装 Node.js 18+："
  echo "        https://nodejs.org/"
  exit 1
fi

# 检查 Python（仅警告）
if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
  echo "[警告] 未检测到 Python。沙盘和命令行生成器需要 Python 才能跑转写。"
  echo "         仅模型下载、输出格式、语言页可用。"
  echo
fi

# 后台启动服务
node server.js &
NODE_PID=$!
echo "Node 服务 PID: $NODE_PID"

# 退出时清理
cleanup() {
  echo
  echo "停止服务 (PID $NODE_PID)..."
  kill $NODE_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# 等服务就绪
sleep 2

# 自动打开浏览器
URL="http://localhost:8765/"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
else
  echo "[提示] 无法自动打开浏览器，请手动访问 $URL"
fi

echo
echo "============================================"
echo "  已启动 $URL"
echo "  按 Ctrl+C 停止服务"
echo "============================================"

# 等服务退出
wait $NODE_PID
