#!/bin/bash
cd "$(dirname "$0")"
npx --yes pm2 stop bot-trading
npx --yes pm2 delete bot-trading
npx --yes pm2 save
echo "Bot detenido por completo."
