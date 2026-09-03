@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Whisper 中文手册
echo   启动中，浏览器即将自动打开
echo ============================================
echo.

REM 优先使用项目自带的 Node.js（portable），否则用系统的
if exist "node\node.exe" (
    set "NODE=node\node.exe"
    echo [ok] 使用内置 Node.js：%NODE%
) else (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [错误] 未检测到 Node.js。项目目录下也没有 node\node.exe。
        echo        请从 https://nodejs.org/ 下载 Node.js 18+，或把 node.exe 放到 node\ 目录。
        echo.
        pause
        exit /b 1
    )
    set "NODE=node"
    echo [ok] 使用系统 Node.js
)

REM 检查 Python（可选）
where python >nul 2>nul
if errorlevel 1 (
    echo [警告] 未检测到 Python。沙盘和命令行生成器需要 Python 才能跑转写。
    echo         仅模型下载、输出格式、语言页可用。
    echo.
)

REM 启动服务（在后台窗口）
start "WhisperWeb" /min cmd /c "%NODE% server.js"

REM 等服务就绪
echo 等待服务就绪...
timeout /t 3 /nobreak >nul

REM 自动打开浏览器
start "" "http://localhost:8765/"

echo.
echo ============================================
echo   已启动 http://localhost:8765/
echo   关闭服务：任务栏找 WhisperWeb 窗口，结束它
echo ============================================
echo.
pause
