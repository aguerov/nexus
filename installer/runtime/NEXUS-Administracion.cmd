@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -STA -File "%~dp0scripts\nexus-admin.ps1" %*
