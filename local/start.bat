@echo off
chcp 65001 >nul
title 3DNest FloorPlan Studio 户型图设计工作台
cd /d "%~dp0"
python server.py
if errorlevel 1 (
    echo Python 运行失败，尝试使用系统默认端口启动...
    python -m http.server 8080
)
pause
