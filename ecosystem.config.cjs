// Configuracion de PM2 para correr el bot en segundo plano (modo 24/7),
// sin necesidad de dejar una ventana de terminal abierta, con reinicio
// automatico si el proceso llegara a caerse.
module.exports = {
  apps: [
    {
      name: "bot-trading",
      // Usa el codigo ya compilado (dist/) en vez de ejecutar TypeScript al
      // vuelo con tsx: evita problemas de compatibilidad de tsx con
      // versiones de Node.js muy recientes. Recuerda correr "npm run build"
      // antes de iniciar (los lanzadores bot-24-7-iniciar.* ya lo hacen).
      script: "./dist/src/index.js",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 30,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
      },
      out_file: "./data/bot-trading-out.log",
      error_file: "./data/bot-trading-error.log",
      time: true,
    },
  ],
};
