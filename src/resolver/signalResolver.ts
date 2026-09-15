import { SignalsRepository } from "../db/signalsRepository.js";
import { fetchLastPrice } from "../market/binanceReadOnlyClient.js";
import { SignalRecord } from "../types/signal.js";

/**
 * Proceso en segundo plano que monitorea el precio de mercado (solo lectura,
 * REST publico) de cada señal PENDING y la marca como WIN o LOSS en cuanto
 * el precio toca el Take Profit o el Stop Loss. Tambien va acumulando el
 * MAE (Maximum Adverse Excursion) y el MFE (Maximum Favorable Excursion)
 * para enriquecer el analisis posterior de Claude.
 */
export class SignalResolver {
  private readonly excursion = new Map<string, { mae: number; mfe: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo: SignalsRepository,
    private readonly restBaseUrl: string,
    private readonly pollMs: number,
    private readonly onResolved?: (signal: SignalRecord, status: "WIN" | "LOSS", exitPrice: number) => void
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error("[SignalResolver] error en tick:", err));
    }, this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const pending = this.repo.getPending();
    for (const signal of pending) {
      try {
        const price = await fetchLastPrice(this.restBaseUrl, signal.symbol);
        this.trackExcursion(signal, price);

        const hitTP = signal.direction === "LONG" ? price >= signal.takeProfit : price <= signal.takeProfit;
        const hitSL = signal.direction === "LONG" ? price <= signal.stopLoss : price >= signal.stopLoss;

        if (hitTP || hitSL) {
          const status = hitTP ? "WIN" : "LOSS";
          const excursion = this.excursion.get(signal.id) ?? { mae: 0, mfe: 0 };
          this.repo.resolve(signal.id, status, price, excursion.mae, excursion.mfe);
          this.excursion.delete(signal.id);
          this.onResolved?.(signal, status, price);
        }
      } catch (err) {
        console.error(`[SignalResolver] error resolviendo señal ${signal.id} (${signal.symbol}):`, err);
      }
    }
  }

  private trackExcursion(signal: SignalRecord, price: number): void {
    const prev = this.excursion.get(signal.id) ?? { mae: 0, mfe: 0 };
    const favorable = signal.direction === "LONG" ? price - signal.entryPrice : signal.entryPrice - price;
    const adverse = -favorable;
    this.excursion.set(signal.id, {
      mae: Math.max(prev.mae, adverse),
      mfe: Math.max(prev.mfe, favorable),
    });
  }
}
