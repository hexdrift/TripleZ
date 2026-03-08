@echo off
REM Build script for TripleZ standalone app (Windows)

echo ==========================================
echo TripleZ - Build Script (Windows)
echo ==========================================

echo [1/4] Installing Python dependencies...
pip install -r src\backend\requirements-build.txt
if errorlevel 1 goto :error

echo [2/4] Installing frontend dependencies...
cd src\frontend
call npm ci
if errorlevel 1 goto :error
cd ..\..

echo [3/4] Building Next.js frontend...
cd src\frontend
call npm run build
if errorlevel 1 goto :error
cd ..\..

echo [4/4] Building standalone executable...
pyinstaller scripts\app.spec
if errorlevel 1 goto :error

echo.
echo ==========================================
echo Build complete!
echo Output: dist\TripleZ.exe
echo ==========================================
goto :eof

:error
echo.
echo ==========================================
echo Build FAILED!
echo ==========================================
exit /b 1
