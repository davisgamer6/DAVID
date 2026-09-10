#!/bin/bash
cd "$(dirname "$0")"
npx --yes pm2 logs bot-trading
