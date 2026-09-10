export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isClosed: boolean;
}

/** Average True Range clasico (Wilder), sobre velas cerradas. */
export function computeATR(candles: Candle[], period = 14): number | null {
  const closed = candles.filter((c) => c.isClosed);
  if (closed.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < closed.length; i++) {
    const cur = closed[i];
    const prev = closed[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trueRanges.push(tr);
  }

  const relevant = trueRanges.slice(-period);
  return relevant.reduce((a, b) => a + b, 0) / relevant.length;
}

export function computeEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function computeRSI(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Percentil (0-100) del ultimo valor dentro de una serie historica de ATR. */
export function percentileRank(series: number[], value: number): number {
  if (series.length === 0) return 50;
  const below = series.filter((v) => v <= value).length;
  return (below / series.length) * 100;
}
