#!/bin/bash
cd "$(dirname "$0")"

echo "================================================"
echo "  Bot de Alertas de Trading - Modo 24/7"
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
  cp .env.example .env
fi

mkdir -p data

echo "Preparando el bot (compilando)..."
npm run build

if [ ! -f data/trading-alerts.db ]; then
  node dist/scripts/initDb.js
fi

echo "Iniciando el bot en segundo plano..."
npx --yes pm2 start ecosystem.config.cjs
npx --yes pm2 save

echo
echo "Listo. El bot ya quedo corriendo en segundo plano."
echo "Puedes cerrar esta terminal: el bot seguira activo mientras"
echo "esta computadora este encendida."
echo
echo "- Ver alertas en vivo:    ./ver-alertas.sh"
echo "- Apagarlo por completo:  ./bot-24-7-apagar.sh"
echo
echo "Para que arranque solo al iniciar sesion (Linux con systemd):"
echo "  npx pm2 startup   (sigue las instrucciones que te imprima)"
echo "Para Mac: npx pm2 startup launchd   (sigue las instrucciones que te imprima)"
