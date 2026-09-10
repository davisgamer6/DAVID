@echo off
cd /d "%~dp0"
echo Mostrando las alertas en vivo del bot (Ctrl+C para salir de esta vista,
echo el bot sigue corriendo aunque cierres esta ventana)...
echo.
call npx --yes pm2 logs bot-trading
