import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { Candle } from "./indicators.js";
import { Timeframe } from "../types/strategy.js";

/**
 * Cliente de Binance ESTRICTAMENTE DE SOLO LECTURA.
 * ----------------------------------------------------------------------------
 * Usa unicamente el stream publico de klines (wss://stream.binance.com), que
 * no requiere API key ni firma HMAC de ningun tipo. No existe en este archivo
 * (ni en ningun otro del proyecto) codigo capaz de enviar una orden.
 *
 * Emite el evento `candle` con cada vela cerrada de cada símbolo/timeframe
 * suscrito, para que el motor de estrategias evalue confluencias.
 */
export class BinanceReadOnlyClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly candleBuffers = new Map<string, Candle[]>();
  private readonly maxBufferLength = 500;
  private reconnectAttempts = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly subscriptions: Array<{ symbol: string; timeframe: Timeframe }>
  ) {
    super();
  }

  private bufferKey(symbol: string, timeframe: Timeframe): string {
    return `${symbol.toUpperCase()}@${timeframe}`;
  }

  getCandles(symbol: string, timeframe: Timeframe): Candle[] {
    return this.candleBuffers.get(this.bufferKey(symbol, timeframe)) ?? [];
  }

  connect(): void {
    const streams = this.subscriptions
      .map((s) => `${s.symbol.toLowerCase()}@kline_${s.timeframe}`)
      .join("/");
    const url = `${this.baseUrl}/stream?streams=${streams}`;

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.emit("connected");
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const payload = JSON.parse(raw.toString());
        this.handleKlineMessage(payload?.data);
      } catch (err) {
        this.emit("error", err);
      }
    });

    this.ws.on("close", () => this.scheduleReconnect());
    this.ws.on("error", (err) => this.emit("error", err));
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delayMs = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.emit("reconnecting", { attempt: this.reconnectAttempts, delayMs });
    setTimeout(() => this.connect(), delayMs);
  }

  private handleKlineMessage(data: any): void {
    if (!data || data.e !== "kline") return;
    const k = data.k;
    const symbol: string = data.s;
    const timeframe = k.i as Timeframe;

    const candle: Candle = {
      openTime: k.t,
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
      takerBuyVolume: Number(k.V),
      closeTime: k.T,
      isClosed: Boolean(k.x),
    };

    const key = this.bufferKey(symbol, timeframe);
    const buffer = this.candleBuffers.get(key) ?? [];

    if (buffer.length > 0 && buffer[buffer.length - 1].openTime === candle.openTime) {
      buffer[buffer.length - 1] = candle; // actualiza la vela en formacion
    } else {
      buffer.push(candle);
      if (buffer.length > this.maxBufferLength) buffer.shift();
    }
    this.candleBuffers.set(key, buffer);

    if (candle.isClosed) {
      this.emit("candle", { symbol, timeframe, candle, history: buffer });
    }
  }

  close(): void {
    this.ws?.close();
  }
}

/** Precio de mercado actual via REST publico (sin autenticacion). */
export async function fetchLastPrice(restBaseUrl: string, symbol: string): Promise<number> {
  const res = await fetch(`${restBaseUrl}/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`);
  if (!res.ok) {
    throw new Error(`Error consultando precio de ${symbol}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { price: string };
  return Number(json.price);
}
