@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_CMD="
where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=python"
  )
)

if not defined PYTHON_CMD (
  echo Python 3 is required to start Study Desk.
  echo Install Python and then double-click this file again.
  pause
  exit /b 1
)

echo Starting Study Desk on http://127.0.0.1:4173/index.html
start "" cmd /c "timeout /t 2 >nul && start \"\" http://127.0.0.1:4173/index.html"
%PYTHON_CMD% serve_app.py 4173 --disable-llm

endlocal
