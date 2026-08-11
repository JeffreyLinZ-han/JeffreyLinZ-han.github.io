@echo off
setlocal
cd /d "%~dp0"
del /q README.md 2>nul
del /q BUILD_INFO.json 2>nul
del /q START_LOCAL_PREVIEW.bat 2>nul
del /q START_LOCAL_PREVIEW.command 2>nul
rmdir /s /q _LOCAL_TOOLS 2>nul
echo Cleanup complete.
pause
