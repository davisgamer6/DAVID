@echo off
cd /d "%~dp0"
echo Apagando el bot...
call npx --yes pm2 stop bot-trading
call npx --yes pm2 delete bot-trading
call npx --yes pm2 save
echo.
echo Bot detenido por completo.
pause
