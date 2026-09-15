import "dotenv/config";
import path from "node:path";

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

export const env = {
  sqliteDbPath: path.resolve(optional("SQLITE_DB_PATH", "./data/trading-alerts.db")),

  binanceWsBaseUrl: optional("BINANCE_WS_BASE_URL", "wss://stream.binance.com:9443"),
  binanceRestBaseUrl: optional("BINANCE_REST_BASE_URL", "https://api.binance.com"),

  strategiesDir: path.resolve(optional("STRATEGIES_DIR", "./src/strategies/examples")),

  alertChannels: optional("ALERT_CHANNELS", "console")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramChatId: optional("TELEGRAM_CHAT_ID"),
  discordWebhookUrl: optional("DISCORD_WEBHOOK_URL"),

  signalResolutionPollMs: Number(optional("SIGNAL_RESOLUTION_POLL_MS", "30000")),

  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  claudeModel: optional("CLAUDE_MODEL", "claude-sonnet-5"),
  feedbackLoopIntervalHours: Number(optional("FEEDBACK_LOOP_INTERVAL_HOURS", "24")),
  feedbackLoopMinSamples: Number(optional("FEEDBACK_LOOP_MIN_SAMPLES", "15")),

  runtimeFiltersPath: path.resolve(optional("RUNTIME_FILTERS_PATH", "./data/runtime-filters.json")),
  feedbackLoopAutoApply: optional("FEEDBACK_LOOP_AUTO_APPLY", "false").toLowerCase() === "true",
};

export { required };
