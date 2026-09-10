import { env } from "./config/env.js";
import { assertReadOnlyEnvironment } from "./security/readOnlyGuard.js";
import { loadStrategiesFromDir } from "./strategies/strategyLoader.js";
import { BinanceReadOnlyClient } from "./market/binanceReadOnlyClient.js";
import { evaluateStrategyForSymbol } from "./engine/strategyEngine.js";
import { loadRuntimeFiltersSync } from "./learning/runtimeFilters.js";
import { AlertDispatcher } from "./alerts/alertDispatcher.js";
import { getDb } from "./db/database.js";
import { SignalsRepository, StrategyAdjustmentsRepository } from "./db/signalsRepository.js";
import { SignalResolver } from "./resolver/signalResolver.js";
import { ClaudeClient } from "./learning/claudeClient.js";
import { runFeedbackLoop } from "./learning/claudeFeedbackLoop.js";
import { Timeframe } from "./types/strategy.js";

async function main() {
  // 1) Guardarraíl de seguridad: aborta si detecta credenciales de trading.
  assertReadOnlyEnvironment();

  // 2) Ingestion de estrategias JSON (originadas en transcripciones de YouTube).
  const strategies = await loadStrategiesFromDir(env.strategiesDir);
  if (strategies.length === 0) {
    console.warn(`No se encontraron estrategias activas en ${env.strategiesDir}. El bot seguira corriendo sin generar señales.`);
  } else {
    console.log(`Estrategias cargadas: ${strategies.map((s) => s.id).join(", ")}`);
  }

  // 3) Infraestructura: DB, alertas, resolver.
  const db = getDb(env.sqliteDbPath);
  const signalsRepo = new SignalsRepository(db);
  const adjustmentsRepo = new StrategyAdjustmentsRepository(db);

  const dispatcher = new AlertDispatcher({
    channels: env.alertChannels,
    telegramBotToken: env.telegramBotToken,
    telegramChatId: env.telegramChatId,
    discordWebhookUrl: env.discordWebhookUrl,
  });

  // 4) Cliente de mercado de solo lectura (streams publicos de Binance).
  const subscriptions = strategies.flatMap((s) =>
    s.market.symbols.flatMap((symbol) => [
      { symbol, timeframe: s.market.timeframes.entry as Timeframe },
      { symbol, timeframe: s.market.timeframes.analysis as Timeframe },
    ])
  );

  const marketClient = new BinanceReadOnlyClient(env.binanceWsBaseUrl, subscriptions);

  marketClient.on("connected", () => console.log("[Market] Conectado a Binance (solo lectura, streams publicos)."));
  marketClient.on("reconnecting", ({ attempt, delayMs }) =>
    console.warn(`[Market] Reconectando (intento ${attempt}) en ${delayMs}ms...`)
  );
  marketClient.on("error", (err) => console.error("[Market] Error de WebSocket:", err));

  marketClient.on("candle", async ({ symbol }: { symbol: string }) => {
    for (const strategy of strategies) {
      if (!strategy.market.symbols.includes(symbol)) continue;

      const runtimeFilters = loadRuntimeFiltersSync(env.runtimeFiltersPath);
      const candidate = evaluateStrategyForSymbol(strategy, symbol, marketClient, runtimeFilters);
      if (!candidate) continue;

      signalsRepo.insert(candidate);
      await dispatcher.dispatch(candidate);
    }
  });

  if (subscriptions.length > 0) marketClient.connect();

  // 5) Resolver en segundo plano: marca WIN/LOSS cuando el precio toca TP/SL.
  const resolver = new SignalResolver(signalsRepo, env.binanceRestBaseUrl, env.signalResolutionPollMs, (signal, status) => {
    console.log(`[Resolver] Señal ${signal.symbol} (${signal.direction}) resuelta como ${status}.`);
  });
  resolver.start();

  // 6) Bucle de aprendizaje periodico con Claude (autocritica).
  if (env.anthropicApiKey) {
    const claude = new ClaudeClient(env.anthropicApiKey, env.claudeModel);
    const intervalMs = env.feedbackLoopIntervalHours * 3_600_000;

    const runLoop = () =>
      runFeedbackLoop(signalsRepo, adjustmentsRepo, claude, {
        windowHours: env.feedbackLoopIntervalHours,
        minSamples: env.feedbackLoopMinSamples,
        autoApply: env.feedbackLoopAutoApply,
        runtimeFiltersPath: env.runtimeFiltersPath,
      }).catch((err) => console.error("[FeedbackLoop] error:", err));

    setInterval(runLoop, intervalMs);
    console.log(`[FeedbackLoop] Programado cada ${env.feedbackLoopIntervalHours}h (auto-apply=${env.feedbackLoopAutoApply}).`);
  } else {
    console.warn("[FeedbackLoop] ANTHROPIC_API_KEY no configurada: el bucle de aprendizaje esta desactivado.");
  }

  console.log("Bot de alertas iniciado (modo solo lectura / solo alertas informativas).");
}

main().catch((err) => {
  console.error("Fallo fatal al iniciar el bot:", err);
  process.exit(1);
});
