#!/bin/bash
cd "$(dirname "$0")"

echo "================================================"
echo "  Bot de Alertas de Trading (solo lectura)"
echo "================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontro Node.js instalado. Instalalo desde https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando el bot por primera vez, esto puede tardar 1-2 minutos..."
  npm install
fi

if [ ! -f .env ]; then
  echo "Creando archivo de configuracion inicial..."
  cp .env.example .env
fi

mkdir -p data

echo "Preparando el bot (compilando)..."
npm run build

if [ ! -f data/trading-alerts.db ]; then
  echo "Preparando la base de datos..."
  node dist/scripts/initDb.js
fi

echo
echo "Bot iniciado. Para apagarlo presiona Ctrl+C."
echo

node dist/src/index.js
