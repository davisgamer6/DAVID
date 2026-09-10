// Configuracion de PM2 para correr el bot en segundo plano (modo 24/7),
// sin necesidad de dejar una ventana de terminal abierta, con reinicio
// automatico si el proceso llegara a caerse.
module.exports = {
  apps: [
    {
      name: "bot-trading",
      script: "./node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
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
