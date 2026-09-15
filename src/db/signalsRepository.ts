import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { SignalCandidate, SignalRecord, SignalStatus } from "../types/signal.js";

export class SignalsRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(candidate: SignalCandidate): SignalRecord {
    const record: SignalRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      strategyId: candidate.strategyId,
      symbol: candidate.symbol,
      direction: candidate.direction,
      entryPrice: candidate.entryPrice,
      stopLoss: candidate.stopLoss,
      takeProfit: candidate.takeProfit,
      riskReward: candidate.riskReward,
      status: "PENDING",
      resolvedAt: null,
      exitPrice: null,
      mae: null,
      mfe: null,
      contextJson: JSON.stringify(candidate.context),
    };

    this.db
      .prepare(
        `INSERT INTO signals
          (id, created_at, strategy_id, symbol, direction, entry_price, stop_loss, take_profit, risk_reward, status, context_json)
         VALUES (@id, @createdAt, @strategyId, @symbol, @direction, @entryPrice, @stopLoss, @takeProfit, @riskReward, @status, @contextJson)`
      )
      .run({
        id: record.id,
        createdAt: record.createdAt,
        strategyId: record.strategyId,
        symbol: record.symbol,
        direction: record.direction,
        entryPrice: record.entryPrice,
        stopLoss: record.stopLoss,
        takeProfit: record.takeProfit,
        riskReward: record.riskReward,
        status: record.status,
        contextJson: record.contextJson,
      });

    return record;
  }

  getPending(): SignalRecord[] {
    return this.mapRows(this.db.prepare(`SELECT * FROM signals WHERE status = 'PENDING'`).all());
  }

  resolve(id: string, status: Extract<SignalStatus, "WIN" | "LOSS" | "EXPIRED">, exitPrice: number, mae: number, mfe: number): void {
    this.db
      .prepare(
        `UPDATE signals SET status = ?, resolved_at = ?, exit_price = ?, mae = ?, mfe = ? WHERE id = ?`
      )
      .run(status, new Date().toISOString(), exitPrice, mae, mfe, id);
  }

  getResolvedSince(sinceIso: string): SignalRecord[] {
    return this.mapRows(
      this.db
        .prepare(`SELECT * FROM signals WHERE resolved_at IS NOT NULL AND resolved_at >= ? ORDER BY resolved_at ASC`)
        .all(sinceIso)
    );
  }

  getStats(sinceIso: string): { total: number; wins: number; losses: number; winRate: number | null } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'WIN' THEN 1 ELSE 0 END) as wins,
           SUM(CASE WHEN status = 'LOSS' THEN 1 ELSE 0 END) as losses
         FROM signals
         WHERE resolved_at IS NOT NULL AND resolved_at >= ?`
      )
      .get(sinceIso) as { total: number; wins: number; losses: number };

    const decided = row.wins + row.losses;
    return {
      total: row.total,
      wins: row.wins,
      losses: row.losses,
      winRate: decided > 0 ? row.wins / decided : null,
    };
  }

  private mapRows(rows: unknown[]): SignalRecord[] {
    return (rows as any[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      strategyId: r.strategy_id,
      symbol: r.symbol,
      direction: r.direction,
      entryPrice: r.entry_price,
      stopLoss: r.stop_loss,
      takeProfit: r.take_profit,
      riskReward: r.risk_reward,
      status: r.status,
      resolvedAt: r.resolved_at,
      exitPrice: r.exit_price,
      mae: r.mae,
      mfe: r.mfe,
      contextJson: r.context_json,
    }));
  }
}

export interface StrategyAdjustmentRecord {
  createdAt: string;
  analysisWindowStart: string;
  analysisWindowEnd: string;
  sampleSize: number;
  winRate: number | null;
  claudeSummary: string;
  recommendedFiltersJson: string;
  applied: boolean;
}

export class StrategyAdjustmentsRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(record: Omit<StrategyAdjustmentRecord, "createdAt">): number {
    const info = this.db
      .prepare(
        `INSERT INTO strategy_adjustments
          (created_at, analysis_window_start, analysis_window_end, sample_size, win_rate, claude_summary, recommended_filters_json, applied)
         VALUES (@createdAt, @analysisWindowStart, @analysisWindowEnd, @sampleSize, @winRate, @claudeSummary, @recommendedFiltersJson, @applied)`
      )
      .run({
        createdAt: new Date().toISOString(),
        analysisWindowStart: record.analysisWindowStart,
        analysisWindowEnd: record.analysisWindowEnd,
        sampleSize: record.sampleSize,
        winRate: record.winRate,
        claudeSummary: record.claudeSummary,
        recommendedFiltersJson: record.recommendedFiltersJson,
        applied: record.applied ? 1 : 0,
      });
    return Number(info.lastInsertRowid);
  }

  markApplied(id: number): void {
    this.db.prepare(`UPDATE strategy_adjustments SET applied = 1 WHERE id = ?`).run(id);
  }

  latest(limit = 10): StrategyAdjustmentRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM strategy_adjustments ORDER BY id DESC LIMIT ?`)
      .all(limit) as any[];
    return rows.map((r) => ({
      createdAt: r.created_at,
      analysisWindowStart: r.analysis_window_start,
      analysisWindowEnd: r.analysis_window_end,
      sampleSize: r.sample_size,
      winRate: r.win_rate,
      claudeSummary: r.claude_summary,
      recommendedFiltersJson: r.recommended_filters_json,
      applied: Boolean(r.applied),
    }));
  }
}
