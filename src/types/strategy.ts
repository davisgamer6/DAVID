import { z } from "zod";

/**
 * MODULO DE INGESTION DINAMICA DE ESTRATEGIAS (YOUTUBE -> JSON)
 * ============================================================================
 * Este es el "contrato" que debe cumplir cualquier archivo estrategia.json,
 * tipicamente generado por un pipeline externo que transcribe un video de
 * YouTube (STT) y usa un LLM para extraer reglas estructuradas. El bot no
 * necesita saber nada de ese pipeline: solo consume JSON que cumpla este
 * esquema, validado en tiempo de ejecucion con Zod.
 */

export const TimeframeSchema = z.enum([
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "1w",
]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const DirectionBiasSchema = z.enum(["LONG", "SHORT", "EITHER"]);

/** Tipos de condicion de entrada soportados nativamente por el motor de confluencias.
 *  El motor esta diseñado para poder extenderse (ver engine/confluenceEvaluator.ts)
 *  sin tener que tocar el resto del sistema. */
export const ConditionTypeSchema = z.enum([
  "LIQUIDITY_SWEEP",
  "FVG",
  "ORDER_BLOCK",
  "EMA_TREND_FILTER",
  "RSI_FILTER",
  "ATR_VOLATILITY_FILTER",
  "BREAK_OF_STRUCTURE",
  "OTE_FIBONACCI",
  "VOLUME_CLIMACTIC_DELTA",
]);
export type ConditionType = z.infer<typeof ConditionTypeSchema>;

export const EntryConditionSchema = z.object({
  type: ConditionTypeSchema,
  timeframe: TimeframeSchema.optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  weight: z.number().min(0).max(1).default(1),
});
export type EntryCondition = z.infer<typeof EntryConditionSchema>;

export const KillzoneSchema = z.object({
  name: z.string(),
  startUTC: z.string().regex(/^\d{2}:\d{2}$/),
  endUTC: z.string().regex(/^\d{2}:\d{2}$/),
});
export type Killzone = z.infer<typeof KillzoneSchema>;

export const RiskManagementSchema = z.object({
  stopLoss: z.object({
    method: z.enum(["STRUCTURE", "ATR_MULTIPLE", "FIXED_PERCENT"]),
    bufferATRMultiple: z.number().nonnegative().default(0.2),
    fixedPercent: z.number().positive().optional(),
  }),
  takeProfit: z.object({
    method: z.enum(["RR_MULTIPLE", "FIXED_PERCENT", "NEXT_LIQUIDITY_POOL"]),
    rrTarget: z.number().positive().default(2),
    fixedPercent: z.number().positive().optional(),
  }),
  minRiskReward: z.number().min(1).default(2),
  maxRiskPercentPerTrade: z.number().positive().max(100).default(1),
});
export type RiskManagement = z.infer<typeof RiskManagementSchema>;

export const StrategySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean().default(true),
  source: z
    .object({
      youtubeUrl: z.string().url().optional(),
      videoTitle: z.string().optional(),
      channel: z.string().optional(),
      extractedAt: z.string().optional(),
      extractionConfidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
  market: z.object({
    symbols: z.array(z.string().min(3)).min(1),
    timeframes: z.object({
      analysis: TimeframeSchema,
      entry: TimeframeSchema,
    }),
    directionBias: DirectionBiasSchema.default("EITHER"),
  }),
  session: z
    .object({
      killzones: z.array(KillzoneSchema).default([]),
      allowWeekends: z.boolean().default(false),
    })
    .default({ killzones: [], allowWeekends: false }),
  entryRules: z.object({
    logic: z.enum(["AND", "WEIGHTED_SCORE"]).default("AND"),
    minScore: z.number().min(0).max(1).optional(),
    conditions: z.array(EntryConditionSchema).min(1),
  }),
  riskManagement: RiskManagementSchema,
  filters: z
    .object({
      minATRPercentile: z.number().min(0).max(100).optional(),
      excludeNews: z.boolean().default(false),
      cooldownMinutesPerSymbol: z.number().nonnegative().default(30),
    })
    .default({ excludeNews: false, cooldownMinutesPerSymbol: 30 }),
});

export type Strategy = z.infer<typeof StrategySchema>;
