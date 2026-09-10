#!/bin/bash
cd "$(dirname "$0")"

echo "================================================"
echo "  Bot de Alertas de Trading (solo lectura)"
echo "================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontro Node.js instalado en esta computadora."
  echo
  echo "1. Ve a https://nodejs.org"
  echo "2. Descarga la version \"LTS\" e instalala"
  echo "3. Vuelve a hacer doble clic en este archivo cuando termine"
  echo
  read -p "Presiona Enter para salir..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando el bot por primera vez, esto puede tardar 1-2 minutos..."
  npm install || { echo "Algo fallo instalando dependencias."; read -p "Presiona Enter para salir..."; exit 1; }
fi

if [ ! -f .env ]; then
  echo "Creando archivo de configuracion inicial..."
  cp .env.example .env
fi

mkdir -p data

if [ ! -f data/trading-alerts.db ]; then
  echo "Preparando la base de datos..."
  npm run db:init
fi

echo
echo "------------------------------------------------"
echo "Bot iniciado. NO cierres esta ventana."
echo "Para apagarlo: cierra esta ventana o presiona Ctrl+C."
echo "------------------------------------------------"
echo

npm run dev

echo
echo "El bot se detuvo."
read -p "Presiona Enter para salir..."
