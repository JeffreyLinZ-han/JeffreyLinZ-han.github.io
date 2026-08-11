@echo off
cd /d "%~dp0\.."
echo This removes only unused V0.1 viewer/runtime assets. V0.2 JSON models are preserved.
echo.
rmdir /s /q "demos\robot-arm\model" 2>nul
rmdir /s /q "demos\harvesting\model" 2>nul
del /q "demos\needle\models\*.step" 2>nul
del /q "assets\js\mujoco-viewer.js" 2>nul
del /q "assets\js\needle-viewer.js" 2>nul
echo Done. You can delete the _LOCAL_TOOLS folder before committing if you do not want it in GitHub.
pause
