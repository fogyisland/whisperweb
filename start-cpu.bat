@echo off
REM ============================================================
REM   Whisper 中文手册 —— 强制 CPU 模式
REM
REM   显式选择 CPU 推理（不装 CUDA torch，约 200 MB）。
REM   适合没有 NVIDIA 显卡、或不想等大体积下载的场景。
REM   速度比 GPU 慢 5–15 倍，但兼容性最好。
REM
REM   如要切换到 GPU，请用 start-gpu.bat 或先删 venv\。
REM ============================================================

set "WHISPER_DEVICE=cpu"
call "%~dp0start.bat" %*
