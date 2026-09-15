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

/**
 * FVG (Fair Value Gap) con Consequent Encroachment (CE): en vez de solo mirar
 * si las ultimas 3 velas dejaron un hueco, busca hacia atras cualquier hueco
 * sin llenar dentro del lookback y calcula su punto medio (CE). Si
 * `requireConsequentEncroachment` esta activo, solo dispara cuando el precio
 * actual esta retrocediendo justo sobre ese punto medio (tolerancia en
 * multiplos de ATR), en vez de en cualquier punto dentro del hueco.
 */
const evaluateFVG: Evaluator = (candles, params) => {
  const minGapATRRatio = Number(params.minGapATRRatio ?? 0.15);
  const lookback = Number(params.lookbackCandles ?? 30);
  const requireCE = Boolean(params.requireConsequentEncroachment ?? false);
  const ceToleranceATRRatio = Number(params.ceTolerance ?? 0.1);
  const window = last(candles, lookback);
  if (window.length < 4) {
    return { type: "FVG", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const atr = computeATR(candles, 14) ?? 0;
  if (atr === 0) return { type: "FVG", passed: false, directionHint: null, detail: "ATR no disponible" };
  const current = window[window.length - 1];

  // Recorre hacia atras cada patron de 3 velas (c1, c2, c3) buscando un hueco aun vigente.
  for (let i = window.length - 2; i >= 2; i--) {
    const c1 = window[i - 2];
    const c3 = window[i];

    const bullishGap = c3.low - c1.high;
    if (bullishGap > 0 && bullishGap / atr >= minGapATRRatio) {
      const ce = (c3.low + c1.high) / 2;
      const stillUnfilled = current.low > c1.high;
      const atCE = Math.abs(current.close - ce) <= atr * ceToleranceATRRatio;
      if (stillUnfilled && (!requireCE || atCE)) {
        return { type: "FVG", passed: true, directionHint: "LONG", detail: `FVG alcista, precio en CE (${ce.toFixed(2)})` };
      }
    }

    const bearishGap = c1.low - c3.high;
    if (bearishGap > 0 && bearishGap / atr >= minGapATRRatio) {
      const ce = (c1.low + c3.high) / 2;
      const stillUnfilled = current.high < c1.low;
      const atCE = Math.abs(current.close - ce) <= atr * ceToleranceATRRatio;
      if (stillUnfilled && (!requireCE || atCE)) {
        return { type: "FVG", passed: true, directionHint: "SHORT", detail: `FVG bajista, precio en CE (${ce.toFixed(2)})` };
      }
    }
  }

  return { type: "FVG", passed: false, directionHint: null, detail: "sin Fair Value Gap vigente" };
};

/**
 * Order Block con linea proximal (apertura de la vela candidata) y distal
 * (mecha extrema), e invalidacion: si alguna vela posterior al OB ya cerro
 * mas alla de la linea distal, ese OB queda descartado (no se usa para
 * mitigacion), replicando la regla de invalidacion pedida.
 */
const evaluateOrderBlock: Evaluator = (candles, params) => {
  const lookback = Number(params.lookbackCandles ?? 30);
  const window = last(candles, lookback);
  if (window.length < 5) {
    return { type: "ORDER_BLOCK", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const current = window[window.length - 1];

  for (let i = window.length - 2; i >= 1; i--) {
    const candidate = window[i];
    const impulse = window[i + 1];
    const candidateRange = candidate.high - candidate.low || 1e-9;
    const isBearishCandidate = candidate.close < candidate.open;
    const isBullishCandidate = candidate.close > candidate.open;
    const impulseUp = impulse.close - impulse.open;
    const impulseDown = impulse.open - impulse.close;
    const candlesSinceOB = window.slice(i + 1, window.length - 1);

    if (isBearishCandidate && impulseUp > candidateRange * 1.5) {
      const proximal = candidate.open;
      const distal = candidate.low;
      const invalidated = candlesSinceOB.some((c) => c.close < distal);
      if (!invalidated && current.low <= proximal && current.close > distal) {
        return {
          type: "ORDER_BLOCK",
          passed: true,
          directionHint: "LONG",
          detail: `mitigacion de OB alcista (proximal ${proximal.toFixed(2)}, distal ${distal.toFixed(2)})`,
        };
      }
    }
    if (isBullishCandidate && impulseDown > candidateRange * 1.5) {
      const proximal = candidate.open;
      const distal = candidate.high;
      const invalidated = candlesSinceOB.some((c) => c.close > distal);
      if (!invalidated && current.high >= proximal && current.close < distal) {
        return {
          type: "ORDER_BLOCK",
          passed: true,
          directionHint: "SHORT",
          detail: `mitigacion de OB bajista (proximal ${proximal.toFixed(2)}, distal ${distal.toFixed(2)})`,
        };
      }
    }
  }
  return { type: "ORDER_BLOCK", passed: false, directionHint: null, detail: "sin mitigacion de Order Block valido" };
};

/**
 * MSS / CHoCH (Market Structure Shift / Change of Character): a diferencia
 * de LIQUIDITY_SWEEP (que exige que la mecha rompa y el CUERPO cierre de
 * vuelta adentro), esta condicion exige que el CIERRE de la vela quede mas
 * alla de la estructura previa -- un simple pabilo no confirma un MSS.
 */
const evaluateBreakOfStructure: Evaluator = (candles, params) => {
  const lookback = Number(params.lookbackCandles ?? 20);
  const window = last(candles, lookback);
  if (window.length < 5) {
    return { type: "BREAK_OF_STRUCTURE", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const current = window[window.length - 1];
  const priorCandles = window.slice(0, -1);
  const priorHigh = Math.max(...priorCandles.map((c) => c.high));
  const priorLow = Math.min(...priorCandles.map((c) => c.low));

  if (current.close > priorHigh) {
    return { type: "BREAK_OF_STRUCTURE", passed: true, directionHint: "LONG", detail: `MSS alcista: cierre por encima de ${priorHigh.toFixed(2)}` };
  }
  if (current.close < priorLow) {
    return { type: "BREAK_OF_STRUCTURE", passed: true, directionHint: "SHORT", detail: `MSS bajista: cierre por debajo de ${priorLow.toFixed(2)}` };
  }
  return { type: "BREAK_OF_STRUCTURE", passed: false, directionHint: null, detail: "sin cambio de estructura confirmado por cuerpo" };
};

/**
 * Zona OTE (Optimal Trade Entry) de Fibonacci: identifica el ultimo tramo
 * impulsivo (del minimo al maximo del lookback, o viceversa) y comprueba si
 * el precio actual esta retrocediendo dentro de la banda 62%-79% de ese
 * tramo (el "sweet spot" clasico esta en 70.5%, dentro de esa banda).
 */
const evaluateOteFibonacci: Evaluator = (candles, params) => {
  const lookback = Number(params.lookbackCandles ?? 30);
  const minRetracement = Number(params.minRetracement ?? 0.62);
  const maxRetracement = Number(params.maxRetracement ?? 0.79);
  const window = last(candles, lookback);
  if (window.length < 5) {
    return { type: "OTE_FIBONACCI", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const current = window[window.length - 1];

  let highIdx = 0;
  let lowIdx = 0;
  for (let i = 1; i < window.length; i++) {
    if (window[i].high > window[highIdx].high) highIdx = i;
    if (window[i].low < window[lowIdx].low) lowIdx = i;
  }
  const swingHigh = window[highIdx].high;
  const swingLow = window[lowIdx].low;
  const range = swingHigh - swingLow;
  if (range <= 0) return { type: "OTE_FIBONACCI", passed: false, directionHint: null, detail: "rango invalido" };

  if (lowIdx < highIdx) {
    // Impulso alcista (minimo antes que maximo): se busca retroceso comprable hacia el minimo.
    const upperBound = swingHigh - range * minRetracement;
    const lowerBound = swingHigh - range * maxRetracement;
    if (current.close <= upperBound && current.close >= lowerBound) {
      const pct = ((swingHigh - current.close) / range) * 100;
      return { type: "OTE_FIBONACCI", passed: true, directionHint: "LONG", detail: `retroceso en zona OTE (${pct.toFixed(1)}%)` };
    }
  }
  if (highIdx < lowIdx) {
    // Impulso bajista (maximo antes que minimo): se busca retroceso vendible hacia el maximo.
    const lowerBound = swingLow + range * minRetracement;
    const upperBound = swingLow + range * maxRetracement;
    if (current.close >= lowerBound && current.close <= upperBound) {
      const pct = ((current.close - swingLow) / range) * 100;
      return { type: "OTE_FIBONACCI", passed: true, directionHint: "SHORT", detail: `retroceso en zona OTE (${pct.toFixed(1)}%)` };
    }
  }
  return { type: "OTE_FIBONACCI", passed: false, directionHint: null, detail: "precio fuera de zona OTE" };
};

/**
 * Volumen climatico + Delta: usa el volumen real de cada vela (dato publico
 * de Binance) para exigir un pico de al menos `minVolumeMultiple` veces el
 * promedio reciente, y aproxima el "Delta" (compra vs venta agresiva) con el
 * campo de volumen comprado por takers que Binance ya incluye en el propio
 * stream de klines -- sin necesitar el stream de aggTrades.
 */
const evaluateVolumeClimacticDelta: Evaluator = (candles, params) => {
  const period = Number(params.period ?? 20);
  const minVolumeMultiple = Number(params.minVolumeMultiple ?? 2.0);
  const window = last(candles, period + 1);
  if (window.length < period + 1) {
    return { type: "VOLUME_CLIMACTIC_DELTA", passed: false, directionHint: null, detail: "datos insuficientes" };
  }
  const current = window[window.length - 1];
  const priorVolumes = window.slice(0, -1).map((c) => c.volume);
  const avgVolume = priorVolumes.reduce((a, b) => a + b, 0) / priorVolumes.length;
  if (avgVolume === 0) {
    return { type: "VOLUME_CLIMACTIC_DELTA", passed: false, directionHint: null, detail: "volumen promedio invalido" };
  }

  const volumeMultiple = current.volume / avgVolume;
  if (volumeMultiple < minVolumeMultiple) {
    return {
      type: "VOLUME_CLIMACTIC_DELTA",
      passed: false,
      directionHint: null,
      detail: `volumen ${volumeMultiple.toFixed(1)}x (se requiere ${minVolumeMultiple}x)`,
    };
  }

  const takerBuy = current.takerBuyVolume ?? current.volume / 2;
  const takerSell = current.volume - takerBuy;
  const delta = takerBuy - takerSell;

  if (delta > 0) {
    return { type: "VOLUME_CLIMACTIC_DELTA", passed: true, directionHint: "LONG", detail: `volumen climatico ${volumeMultiple.toFixed(1)}x, delta comprador` };
  }
  if (delta < 0) {
    return { type: "VOLUME_CLIMACTIC_DELTA", passed: true, directionHint: "SHORT", detail: `volumen climatico ${volumeMultiple.toFixed(1)}x, delta vendedor` };
  }
  return { type: "VOLUME_CLIMACTIC_DELTA", passed: false, directionHint: null, detail: "delta neutral" };
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
  BREAK_OF_STRUCTURE: evaluateBreakOfStructure,
  OTE_FIBONACCI: evaluateOteFibonacci,
  VOLUME_CLIMACTIC_DELTA: evaluateVolumeClimacticDelta,
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
