@echo off
rem Nhap dup file nay de build APK debug. Them tham so: build-apk.bat -Release -Install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1" %*
echo.
pause
