@echo off
cd /d "%~dp0"
echo Starting Jeffrey Lin portfolio at http://localhost:8000
echo Keep this window open while previewing the website.
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  py -m http.server 8000
) else (
  start "" http://localhost:8000
  python -m http.server 8000
)
