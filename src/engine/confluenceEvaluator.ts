import { Candle, computeATR, computeEMA, percentileRank } from "../market/indicators.js";
import { EntryCondition } from "../types/strategy.js";
import { SignalDirection } from "../types/signal.js";
export type { SignalDirection };

export interface ConditionResult {
  type: string;
  passed: boolean;
  directionHint: SignalDirection | null;
  detail: string;
}

/**
 * Evaluadores heuristicos de referencia para cada tipo de condicion.
 * Son implementaciones simplificadas y documentadas: el objetivo de este
 * proyecto es la ARQUITECTURA (ingestion -> evaluacion -> alerta -> registro
 * -> aprendizaje), no un detector ICT de nivel institucional. Se recomienda
 * afinar/objetar estos detectores con datos reales antes de confiar en ellos.
 */
type Evaluator = (candles: Candle[], params: Record<string, unknown>) => ConditionResult;

function last<T>(arr: T[], n = 1): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}

const evaluateLiquiditySweep: Evaluator = (candles, params) => {
  const lookback = Number(params.lookbackCandles ?? 20);
  const minWickRatio = Number(params.minWickRatio ?? 0.4);
  const window = last(candles, lookback + 1);
  if (window.length < lookback + 1) {
    return { type: "LIQUIDITY_SWEEP", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const current = window[window.length - 1];
  const priorRange = window.slice(0, -1);
  const priorHigh = Math.max(...priorRange.map((c) => c.high));
  const priorLow = Math.min(...priorRange.map((c) => c.low));
  const body = Math.abs(current.close - current.open) || 1e-9;

  const sweptHigh = current.high > priorHigh && current.close < priorHigh;
  const upperWickRatio = (current.high - Math.max(current.open, current.close)) / body;
  if (sweptHigh && upperWickRatio >= minWickRatio) {
    return { type: "LIQUIDITY_SWEEP", passed: true, directionHint: "SHORT", detail: `barrido de maximos de ${lookback} velas` };
  }

  const sweptLow = current.low < priorLow && current.close > priorLow;
  const lowerWickRatio = (Math.min(current.open, current.close) - current.low) / body;
  if (sweptLow && lowerWickRatio >= minWickRatio) {
    return { type: "LIQUIDITY_SWEEP", passed: true, directionHint: "LONG", detail: `barrido de minimos de ${lookback} velas` };
  }

  return { type: "LIQUIDITY_SWEEP", passed: false, directionHint: null, detail: "sin barrido de liquidez" };
};

const evaluateFVG: Evaluator = (candles, params) => {
  const minGapATRRatio = Number(params.minGapATRRatio ?? 0.15);
  if (candles.length < 4) {
    return { type: "FVG", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const [c1, , c3] = last(candles, 3); // patron de 3 velas: gap entre vela 1 y vela 3
  const atr = computeATR(candles, 14) ?? 0;
  if (atr === 0) return { type: "FVG", passed: false, directionHint: null, detail: "ATR no disponible" };

  const bullishGap = c3.low - c1.high;
  if (bullishGap > 0 && bullishGap / atr >= minGapATRRatio) {
    return { type: "FVG", passed: true, directionHint: "LONG", detail: `FVG alcista (${(bullishGap / atr).toFixed(2)}x ATR)` };
  }

  const bearishGap = c1.low - c3.high;
  if (bearishGap > 0 && bearishGap / atr >= minGapATRRatio) {
    return { type: "FVG", passed: true, directionHint: "SHORT", detail: `FVG bajista (${(bearishGap / atr).toFixed(2)}x ATR)` };
  }

  return { type: "FVG", passed: false, directionHint: null, detail: "sin Fair Value Gap significativo" };
};

const evaluateOrderBlock: Evaluator = (candles, params) => {
  const lookback = Number(params.lookbackCandles ?? 30);
  const window = last(candles, lookback);
  if (window.length < 5) {
    return { type: "ORDER_BLOCK", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const current = window[window.length - 1];
  // Heuristica: ultima vela bajista antes de un impulso alcista fuerte (>1.5x su propio rango) = Order Block alcista, y viceversa.
  for (let i = window.length - 2; i >= 1; i--) {
    const candidate = window[i];
    const impulse = window[i + 1];
    const candidateRange = candidate.high - candidate.low || 1e-9;
    const isBearishCandidate = candidate.close < candidate.open;
    const isBullishCandidate = candidate.close > candidate.open;
    const impulseUp = impulse.close - impulse.open;
    const impulseDown = impulse.open - impulse.close;

    if (isBearishCandidate && impulseUp > candidateRange * 1.5 && current.low <= candidate.high && current.close > candidate.low) {
      return { type: "ORDER_BLOCK", passed: true, directionHint: "LONG", detail: "mitigacion de Order Block alcista" };
    }
    if (isBullishCandidate && impulseDown > candidateRange * 1.5 && current.high >= candidate.low && current.close < candidate.high) {
      return { type: "ORDER_BLOCK", passed: true, directionHint: "SHORT", detail: "mitigacion de Order Block bajista" };
    }
  }
  return { type: "ORDER_BLOCK", passed: false, directionHint: null, detail: "sin mitigacion de Order Block" };
};

const evaluateEmaTrendFilter: Evaluator = (candles, params) => {
  const period = Number(params.period ?? 200);
  const closes = candles.filter((c) => c.isClosed).map((c) => c.close);
  const ema = computeEMA(closes, period);
  if (ema == null) return { type: "EMA_TREND_FILTER", passed: false, directionHint: null, detail: "EMA no disponible aun" };
  const lastClose = closes[closes.length - 1];
  if (lastClose > ema) return { type: "EMA_TREND_FILTER", passed: true, directionHint: "LONG", detail: `precio > EMA${period}` };
  if (lastClose < ema) return { type: "EMA_TREND_FILTER", passed: true, directionHint: "SHORT", detail: `precio < EMA${period}` };
  return { type: "EMA_TREND_FILTER", passed: false, directionHint: null, detail: "precio igual a la EMA" };
};

const evaluateAtrVolatilityFilter: Evaluator = (candles, params) => {
  const period = Number(params.period ?? 14);
  const minPercentile = Number(params.minPercentile ?? 0);
  const atrSeries: number[] = [];
  for (let i = period + 1; i <= candles.length; i++) {
    const atr = computeATR(candles.slice(0, i), period);
    if (atr != null) atrSeries.push(atr);
  }
  const currentAtr = atrSeries[atrSeries.length - 1];
  if (currentAtr == null) return { type: "ATR_VOLATILITY_FILTER", passed: false, directionHint: null, detail: "ATR no disponible" };
  const rank = percentileRank(atrSeries, currentAtr);
  return {
    type: "ATR_VOLATILITY_FILTER",
    passed: rank >= minPercentile,
    directionHint: null,
    detail: `ATR en percentil ${rank.toFixed(0)}`,
  };
};

const evaluators: Record<string, Evaluator> = {
  LIQUIDITY_SWEEP: evaluateLiquiditySweep,
  FVG: evaluateFVG,
  ORDER_BLOCK: evaluateOrderBlock,
  EMA_TREND_FILTER: evaluateEmaTrendFilter,
  ATR_VOLATILITY_FILTER: evaluateAtrVolatilityFilter,
};

/** Punto de extension: registra o sobreescribe un evaluador de condicion. */
export function registerConditionEvaluator(type: string, evaluator: Evaluator): void {
  evaluators[type] = evaluator;
}

export function evaluateCondition(condition: EntryCondition, candles: Candle[]): ConditionResult {
  const evaluator = evaluators[condition.type];
  if (!evaluator) {
    return { type: condition.type, passed: false, directionHint: null, detail: "sin evaluador registrado" };
  }
  return evaluator(candles, condition.params);
}
