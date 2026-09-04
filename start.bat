@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Whisper 中文手册
echo   启动中，浏览器即将自动打开
echo ============================================================
echo.

REM ============ 1. Node ============
if exist "node\node.exe" (
    set "NODE=node\node.exe"
    echo [ok] 使用内置 Node.js
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [error] 未检测到 Node.js。请安装 Node.js 18+:
        echo         https://nodejs.org/
        pause & exit /b 1
    )
    set "NODE=node"
    echo [ok] 使用系统 Node.js
)

REM ============ 2. Python（优先用项目内 portable 版本）============
if exist "python\python.exe" (
    set "PYTHON_BIN=python\python.exe"
    echo [ok] 使用内置 Python: python\python.exe
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [error] 未检测到 Python。需要 portable Python（项目内 python\）
        echo        或系统 Python 3.8+。系统安装:
        echo        https://www.python.org/downloads/
        pause & exit /b 1
    )
    set "PYTHON_BIN=python"
    echo [ok] 使用系统 Python
)

REM ============ 3. 决定模式（GPU / CPU）============
set "DEVICE=cpu"

if defined WHISPER_DEVICE (
    set "DEVICE=%WHISPER_DEVICE%"
    echo [info] WHISPER_DEVICE=%DEVICE% （用户强制）
) else (
    where nvidia-smi >nul 2>nul
    if not errorlevel 1 (
        nvidia-smi >nul 2>nul
        if not errorlevel 1 (
            set "DEVICE=cuda"
            echo [info] 检测到 NVIDIA GPU → CUDA 模式
        ) else (
            echo [info] nvidia-smi 不可用 → CPU 模式
        )
    ) else (
        echo [info] 未找到 nvidia-smi → CPU 模式
    )
)

REM ============ 4. venv ============
if not exist "venv\Scripts\python.exe" (
    echo [step] 创建 Python 虚拟环境 venv\ ...
    "%PYTHON_BIN%" -m venv venv
    if errorlevel 1 (
        echo [error] venv 创建失败
        pause & exit /b 1
    )
    echo [ok] venv 已创建
)

REM 检查 venv 里 torch 是否就绪
venv\Scripts\python.exe -c "import torch" >nul 2>&1
if errorlevel 1 (
    echo [step] 升级 pip ...
    venv\Scripts\python.exe -m pip install --upgrade pip -q

    if /I "%DEVICE%"=="cuda" (
        echo [step] 安装 PyTorch CUDA 12.6（约 2.5 GB）...
    venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu126
    ) else (
        echo [step] 安装 PyTorch CPU 版（约 200 MB）...
    venv\Scripts\python.exe -m pip install torch
    )
    if errorlevel 1 (
        echo [error] torch 安装失败
        pause & exit /b 1
    )

    echo [step] 安装 openai-whisper ...
    venv\Scripts\python.exe -m pip install openai-whisper
    if errorlevel 1 (
        echo [error] openai-whisper 安装失败
        pause & exit /b 1
    )
    echo [ok] 依赖装好
) else (
    echo [ok] venv 已就绪（%DEVICE% 模式）
)

REM 显示实际状态
venv\Scripts\python.exe -c "import torch; v = torch.__version__; ok = torch.cuda.is_available(); print('    torch', v, '| cuda:', ok, '|', torch.cuda.get_device_name() if ok else 'CPU 推理')"

REM ============ 5. 启动 Node（PYTHON 指向 venv）============
set "PYTHON=%~dp0venv\Scripts\python.exe"
set "WHISPER_DEVICE=%DEVICE%"
start "WhisperWeb" /min cmd /c "set PYTHON=%PYTHON%&& set WHISPER_DEVICE=%DEVICE%&& %NODE% server.js"

REM 等服务就绪
echo 等待服务就绪...
timeout /t 3 /nobreak >nul

REM 自动打开浏览器
start "" "http://localhost:8765/"

echo.
echo ============================================================
echo   已启动 http://localhost:8765/
echo   推理模式：%DEVICE%
echo   关闭服务：任务栏找 WhisperWeb 窗口，结束它
echo ============================================================
echo.
pause