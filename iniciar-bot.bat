@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Bot de Alertas de Trading (solo lectura)
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo No se encontro Node.js instalado en esta computadora.
    echo.
    echo 1. Ve a https://nodejs.org
    echo 2. Descarga la version "LTS" e instalala ^(Siguiente, Siguiente, Instalar^)
    echo 3. Vuelve a hacer doble clic en este archivo cuando termine
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Instalando el bot por primera vez, esto puede tardar 1-2 minutos...
    call npm install
    if errorlevel 1 (
        echo.
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
echo ------------------------------------------------
echo Bot iniciado. NO cierres esta ventana.
echo Para apagarlo: cierra esta ventana o presiona Ctrl+C.
echo ------------------------------------------------
echo.

call npm run dev

echo.
echo El bot se detuvo.
pause
