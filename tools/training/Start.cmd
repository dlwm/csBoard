@echo off
setlocal
cd /d "%~dp0\..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, Git for Windows and Go first. See docs\utility-study.zh-CN.md.
  pause
  exit /b 1
)
if not exist "build\go-parser\native\win-x64\csboard-go-parser.exe" (
  echo Preparing the parser. First run needs internet, Git and Go.
  node scripts/training/run.js --prepare
  if errorlevel 1 goto failed
)
if not exist ".local\utility-study\demos" mkdir ".local\utility-study\demos"
echo Put match .dem files into the folder below. Subfolders are supported.
echo %CD%\.local\utility-study\demos
start "" explorer ".local\utility-study\demos"
echo Press any key when the files are ready. Ctrl+C cancels.
pause >nul
node scripts/training/run.js
if errorlevel 1 goto failed
echo Results are in .local\utility-study\results
start "" explorer ".local\utility-study\results"
pause
exit /b 0
:failed
echo Collection did not fully complete. Keep this window's error and rerun to resume.
echo Completed outputs are retained. Do not delete the original Demo files.
pause
exit /b 1
