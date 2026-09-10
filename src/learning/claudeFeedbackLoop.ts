import { SignalsRepository, StrategyAdjustmentsRepository } from "../db/signalsRepository.js";
import { SignalRecord } from "../types/signal.js";
import { ClaudeClient } from "./claudeClient.js";
import {
  SELF_CRITIQUE_SYSTEM_PROMPT,
  buildSelfCritiqueUserPrompt,
  CritiqueInputData,
  SignalSummaryForPrompt,
} from "./prompts/selfCritique.js";
import { loadRuntimeFilters, saveRuntimeFilters, RuntimeFilters } from "./runtimeFilters.js";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export interface FeedbackLoopConfig {
  windowHours: number;
  minSamples: number;
  autoApply: boolean;
  runtimeFiltersPath: string;
}

function toSummary(signal: SignalRecord): SignalSummaryForPrompt {
  const context = safeParseContext(signal.contextJson);
  const created = new Date(signal.createdAt);
  return {
    id: signal.id,
    strategyId: signal.strategyId,
    symbol: signal.symbol,
    direction: signal.direction,
    status: signal.status,
    riskReward: signal.riskReward,
    createdAt: signal.createdAt,
    killzone: context.killzone ?? null,
    dayOfWeekUTC: DAY_NAMES[created.getUTCDay()],
    hourUTC: created.getUTCHours(),
    matchedConditions: context.matchedConditions ?? [],
    mae: signal.mae,
    mfe: signal.mfe,
  };
}

function safeParseContext(json: string): { killzone?: string | null; matchedConditions?: string[] } {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function breakdown(signals: SignalRecord[], keyFn: (s: SignalRecord) => string) {
  const groups = new Map<string, { total: number; wins: number; losses: number }>();
  for (const s of signals) {
    const key = keyFn(s);
    const g = groups.get(key) ?? { total: 0, wins: 0, losses: 0 };
    g.total += 1;
    if (s.status === "WIN") g.wins += 1;
    if (s.status === "LOSS") g.losses += 1;
    groups.set(key, g);
  }
  const result: Record<string, { total: number; wins: number; losses: number; winRate: number }> = {};
  for (const [key, g] of groups) {
    const decided = g.wins + g.losses;
    result[key] = { ...g, winRate: decided > 0 ? g.wins / decided : 0 };
  }
  return result;
}

/**
 * BUCLE DE APRENDIZAJE Y AUTO-MEJORA (FEEDBACK LOOP CON CLAUDE)
 * ============================================================================
 * 1. Lee las señales resueltas (WIN/LOSS) en la ventana configurada.
 * 2. Calcula desgloses (killzone, dia de semana, estrategia) en el propio
 *    bot -- Claude analiza datos ya agregados, no tiene que hacer aritmetica.
 * 3. Envia el prompt de autocritica a Claude y parsea su recomendacion JSON.
 * 4. Registra la recomendacion en `strategy_adjustments` (auditoria).
 * 5. Si FEEDBACK_LOOP_AUTO_APPLY=true, fusiona la recomendacion dentro del
 *    archivo de filtros de runtime; si no, queda pendiente de aprobacion
 *    humana (Human-in-the-loop tambien para el propio aprendizaje).
 */
export async function runFeedbackLoop(
  signalsRepo: SignalsRepository,
  adjustmentsRepo: StrategyAdjustmentsRepository,
  claude: ClaudeClient,
  config: FeedbackLoopConfig
): Promise<{ ran: boolean; reason?: string }> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - config.windowHours * 3_600_000);

  const resolved = signalsRepo.getResolvedSince(windowStart.toISOString());
  if (resolved.length < config.minSamples) {
    return { ran: false, reason: `muestra insuficiente (${resolved.length} < ${config.minSamples})` };
  }

  const losing = resolved.filter((s) => s.status === "LOSS");
  const winning = resolved.filter((s) => s.status === "WIN");
  const wins = winning.length;
  const losses = losing.length;
  const decided = wins + losses;

  const input: CritiqueInputData = {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalResolved: resolved.length,
    wins,
    losses,
    winRate: decided > 0 ? wins / decided : null,
    breakdownByKillzone: breakdown(resolved, (s) => safeParseContext(s.contextJson).killzone ?? "SIN_KILLZONE"),
    breakdownByDayOfWeek: breakdown(resolved, (s) => DAY_NAMES[new Date(s.createdAt).getUTCDay()]),
    breakdownByStrategy: breakdown(resolved, (s) => s.strategyId),
    losingSignals: losing.map(toSummary),
    winningSignals: winning.map(toSummary),
  };

  const userPrompt = buildSelfCritiqueUserPrompt(input);
  const recommendation = await claude.requestSelfCritique(SELF_CRITIQUE_SYSTEM_PROMPT, userPrompt);

  const adjustmentId = adjustmentsRepo.insert({
    analysisWindowStart: input.windowStart,
    analysisWindowEnd: input.windowEnd,
    sampleSize: input.totalResolved,
    winRate: input.winRate,
    claudeSummary: recommendation.summary,
    recommendedFiltersJson: JSON.stringify(recommendation.recommendedFilters),
    applied: false,
  });

  console.log(`\n[FeedbackLoop] Autocritica de Claude (muestra=${input.totalResolved}, winRate=${(input.winRate ?? 0) * 100}%):`);
  console.log(`  Resumen: ${recommendation.summary}`);
  console.log(`  Confianza: ${recommendation.confidence}`);
  for (const finding of recommendation.findings) {
    console.log(`  - Hallazgo: ${finding.pattern} (n=${finding.supportingSampleSize})`);
  }

  if (config.autoApply) {
    const current = await loadRuntimeFilters(config.runtimeFiltersPath);
    const merged = mergeRuntimeFilters(current, recommendation.recommendedFilters);
    await saveRuntimeFilters(config.runtimeFiltersPath, merged);
    adjustmentsRepo.markApplied(adjustmentId);
    console.log(`  -> Filtros de runtime actualizados automaticamente en ${config.runtimeFiltersPath}`);
  } else {
    console.log(
      `  -> Recomendacion registrada en strategy_adjustments (id=${adjustmentId}) pendiente de revision humana. ` +
        `Activa FEEDBACK_LOOP_AUTO_APPLY=true para aplicarla automaticamente.`
    );
  }

  return { ran: true };
}

function mergeRuntimeFilters(
  current: RuntimeFilters,
  recommended: {
    minATRPercentile: number | null;
    minRiskReward: number | null;
    blockedKillzones: string[];
    perSymbol?: Record<string, { minATRPercentile: number | null; minRiskReward: number | null; blockedKillzones: string[] }>;
  }
): RuntimeFilters {
  const perSymbol: RuntimeFilters["perSymbol"] = { ...current.perSymbol };
  for (const [symbol, filters] of Object.entries(recommended.perSymbol ?? {})) {
    perSymbol[symbol] = {
      minATRPercentile: filters.minATRPercentile ?? undefined,
      minRiskReward: filters.minRiskReward ?? undefined,
      blockedKillzones: filters.blockedKillzones,
    };
  }

  return {
    ...current,
    minATRPercentile: recommended.minATRPercentile ?? current.minATRPercentile,
    minRiskReward: recommended.minRiskReward ?? current.minRiskReward,
    blockedKillzones: recommended.blockedKillzones?.length ? recommended.blockedKillzones : current.blockedKillzones,
    perSymbol,
    notes: `Ultima actualizacion automatica del bucle de aprendizaje: ${new Date().toISOString()}`,
  };
}
