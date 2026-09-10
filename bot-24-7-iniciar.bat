@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Bot de Alertas de Trading - Modo 24/7
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo No se encontro Node.js instalado en esta computadora.
    echo Ve a https://nodejs.org, instala la version LTS, y vuelve a intentarlo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Instalando el bot por primera vez, esto puede tardar 1-2 minutos...
    call npm install
    if errorlevel 1 (
        echo Algo fallo instalando dependencias. Revisa el mensaje de arriba.
        pause
        exit /b 1
    )
)

if not exist .env (
    echo Creando archivo de configuracion inicial...
    copy .env.example .env >nul
)

if not exist data (
    mkdir data
)

if not exist data\trading-alerts.db (
    echo Preparando la base de datos...
    call npm run db:init
)

echo.
echo Iniciando el bot en segundo plano (esto puede tardar unos segundos
echo la primera vez, ya que descarga el administrador de procesos PM2)...
echo.
call npx --yes pm2 start ecosystem.config.cjs
call npx --yes pm2 save

echo.
echo ------------------------------------------------
echo Listo. El bot ya quedo corriendo en segundo plano.
echo PUEDES CERRAR esta ventana: el bot seguira activo
echo mientras esta computadora este encendida.
echo ------------------------------------------------
echo.
echo   - Ver las alertas en vivo:        ver-alertas.bat
echo   - Apagar el bot por completo:     bot-24-7-apagar.bat
echo.
echo Para que arranque solo cada vez que enciendas la computadora,
echo revisa la seccion "Modo 24/7" del archivo README.md (son 3 pasos
echo con el Explorador de Windows, sin escribir nada).
echo.
pause
