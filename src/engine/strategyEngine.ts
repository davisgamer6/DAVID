import { Candle, computeATR } from "../market/indicators.js";
import { activeKillzone, isWeekendUTC } from "../market/killzones.js";
import { Strategy } from "../types/strategy.js";
import { SignalCandidate, SignalDirection } from "../types/signal.js";
import { evaluateCondition } from "./confluenceEvaluator.js";
import { RuntimeFilters } from "../learning/runtimeFilters.js";

export interface CandleProvider {
  getCandles(symbol: string, timeframe: string): Candle[];
}

const lastSignalAtBySymbol = new Map<string, number>();

/**
 * Evalua una estrategia contra el estado actual del mercado para un simbolo
 * dado y devuelve una señal candidata si (y solo si) se cumple la
 * confluencia definida en el JSON de estrategia, con la gestion de riesgo
 * ya calculada (SL, TP, R:R).
 *
 * Aplica ademas los `runtimeFilters` -- los ajustes que el bucle de
 * aprendizaje de Claude sugiere tras analizar el historial de señales
 * (ver src/learning). Esto permite mejorar el sistema SIN tocar el codigo
 * fuente ni el JSON original de la estrategia.
 */
export function evaluateStrategyForSymbol(
  strategy: Strategy,
  symbol: string,
  candleProvider: CandleProvider,
  runtimeFilters: RuntimeFilters,
  now: Date = new Date()
): SignalCandidate | null {
  // --- Filtro de sesion / calendario (killzones, fin de semana) ---
  if (!strategy.session.allowWeekends && isWeekendUTC(now)) return null;

  const killzone = activeKillzone(strategy.session.killzones, now);
  if (strategy.session.killzones.length > 0 && !killzone) return null;

  const symbolFilters = runtimeFilters.perSymbol?.[symbol];
  if (runtimeFilters.blockedKillzones?.includes(killzone ?? "")) return null;
  if (symbolFilters?.blockedKillzones?.includes(killzone ?? "")) return null;

  // --- Cooldown para evitar spam de alertas repetidas ---
  const cooldownMinutes = strategy.filters.cooldownMinutesPerSymbol;
  const lastAt = lastSignalAtBySymbol.get(`${strategy.id}:${symbol}`);
  if (lastAt && now.getTime() - lastAt < cooldownMinutes * 60_000) return null;

  const entryCandles = candleProvider.getCandles(symbol, strategy.market.timeframes.entry);
  const analysisCandles = candleProvider.getCandles(symbol, strategy.market.timeframes.analysis);
  if (entryCandles.length < 10) return null;

  // --- Filtro de volatilidad (ATR percentil), ajustable por runtime filters ---
  const minAtrPercentile = symbolFilters?.minATRPercentile ?? runtimeFilters.minATRPercentile ?? strategy.filters.minATRPercentile;
  const atr = computeATR(entryCandles, 14);
  if (atr == null) return null;

  // --- Evaluacion de confluencias ---
  const matchedConditions: string[] = [];
  const directionVotes: Record<SignalDirection, number> = { LONG: 0, SHORT: 0 };
  let totalWeight = 0;
  let scoredWeight = 0;

  for (const condition of strategy.entryRules.conditions) {
    const candlesForCondition = condition.timeframe === strategy.market.timeframes.analysis ? analysisCandles : entryCandles;
    const result = evaluateCondition(condition, candlesForCondition);
    totalWeight += condition.weight;
    if (result.passed) {
      scoredWeight += condition.weight;
      matchedConditions.push(`${result.type}: ${result.detail}`);
      if (result.directionHint) directionVotes[result.directionHint] += condition.weight;
    } else if (strategy.entryRules.logic === "AND") {
      return null; // logica estricta: todas las condiciones deben cumplirse
    }
  }

  if (strategy.entryRules.logic === "WEIGHTED_SCORE") {
    const minScore = strategy.entryRules.minScore ?? 0.75;
    if (totalWeight === 0 || scoredWeight / totalWeight < minScore) return null;
  }

  const direction: SignalDirection = directionVotes.LONG >= directionVotes.SHORT ? "LONG" : "SHORT";
  if (strategy.market.directionBias !== "EITHER" && strategy.market.directionBias !== direction) return null;
  if (directionVotes.LONG === 0 && directionVotes.SHORT === 0) return null;

  // --- Filtro de volatilidad efectivo ---
  if (minAtrPercentile != null) {
    const atrResult = evaluateCondition(
      { type: "ATR_VOLATILITY_FILTER", params: { period: 14, minPercentile: minAtrPercentile }, weight: 0 },
      entryCandles
    );
    if (!atrResult.passed) return null;
  }

  // --- Gestion de riesgo: calculo de SL / TP ---
  const lastCandle = entryCandles[entryCandles.length - 1];
  const entryPrice = lastCandle.close;
  const buffer = atr * strategy.riskManagement.stopLoss.bufferATRMultiple;

  let stopLoss: number;
  if (direction === "LONG") {
    const structureLow = Math.min(...entryCandles.slice(-20).map((c) => c.low));
    stopLoss = strategy.riskManagement.stopLoss.method === "ATR_MULTIPLE" ? entryPrice - buffer : structureLow - buffer;
  } else {
    const structureHigh = Math.max(...entryCandles.slice(-20).map((c) => c.high));
    stopLoss = strategy.riskManagement.stopLoss.method === "ATR_MULTIPLE" ? entryPrice + buffer : structureHigh + buffer;
  }

  const risk = Math.abs(entryPrice - stopLoss);
  if (risk <= 0) return null;

  const rrTarget = strategy.riskManagement.takeProfit.rrTarget;
  const takeProfit = direction === "LONG" ? entryPrice + risk * rrTarget : entryPrice - risk * rrTarget;
  const riskReward = Math.abs(takeProfit - entryPrice) / risk;

  const minRR = symbolFilters?.minRiskReward ?? runtimeFilters.minRiskReward ?? strategy.riskManagement.minRiskReward;
  if (riskReward < minRR) return null;

  lastSignalAtBySymbol.set(`${strategy.id}:${symbol}`, now.getTime());

  return {
    strategyId: strategy.id,
    symbol,
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
    context: {
      matchedConditions,
      score: totalWeight === 0 ? 1 : scoredWeight / totalWeight,
      killzone,
      timeframe: strategy.market.timeframes.entry,
    },
  };
}
