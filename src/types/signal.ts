export type SignalDirection = "LONG" | "SHORT";
export type SignalStatus = "PENDING" | "WIN" | "LOSS" | "EXPIRED";

/** Etiquetas visuales pedidas por el usuario para la alerta informativa. */
export const DIRECTION_LABEL: Record<SignalDirection, { text: string; color: "green" | "red" }> = {
  LONG: { text: "SELL", color: "green" }, // etiqueta verde de compra/largo, tal como se especifico
  SHORT: { text: "SHORT", color: "red" },
};

export interface SignalRecord {
  id: string;
  createdAt: string; // ISO
  strategyId: string;
  symbol: string;
  direction: SignalDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  status: SignalStatus;
  resolvedAt: string | null;
  exitPrice: number | null;
  /** Maximum Adverse / Favorable Excursion, calculadas por el resolver */
  mae: number | null;
  mfe: number | null;
  /** contexto libre: confluencias que dispararon la señal, killzone activa, etc. */
  contextJson: string;
}

export interface SignalCandidate {
  strategyId: string;
  symbol: string;
  direction: SignalDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  context: {
    matchedConditions: string[];
    score: number;
    killzone: string | null;
    timeframe: string;
  };
}
