@echo off
REM ============================================================
REM   Whisper 中文手册 —— 强制 GPU 模式
REM
REM   显式选择 CUDA 推理（装 PyTorch CUDA 12.6，约 2.5 GB）。
REM   首次运行会下大文件，之后秒加载。
REM   速度比 CPU 快 5–15 倍。要求 NVIDIA 显卡 + 驱动支持 CUDA 12.6+。
REM
REM   如果本机无 NVIDIA 卡或 nvidia-smi 不可用，安装会失败。
REM   此时改用 start-cpu.bat。
REM ============================================================

REM 先验证 nvidia-smi，避免无效下载
where nvidia-smi >nul 2>nul
if errorlevel 1 (
    echo [error] 未找到 nvidia-smi。本机似乎没有 NVIDIA GPU。
    echo        请改用 start-cpu.bat。
    pause
    exit /b 1
)
nvidia-smi >nul 2>nul
if errorlevel 1 (
    echo [error] nvidia-smi 调用失败。NVIDIA 驱动可能没装好。
    echo        请改用 start-cpu.bat。
    pause
    exit /b 1
)

set "WHISPER_DEVICE=cuda"
call "%~dp0start.bat" %*
