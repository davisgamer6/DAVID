/**
 * PROMPT DE AUTOCRITICA / APRENDIZAJE (Constitutional Feedback Loop)
 * ============================================================================
 * Este es el prompt que el bot envia periodicamente a Claude para que
 * analice su propio historial de señales (SQLite), identifique confluencias
 * comunes en los fallos, y proponga ajustes de FILTROS DE RUNTIME (nunca
 * cambios de codigo). Claude responde en JSON estricto para que el bot
 * pueda parsear y (opcionalmente, si FEEDBACK_LOOP_AUTO_APPLY=true) aplicar
 * la recomendacion de forma automatica; por defecto queda solo registrada
 * en la tabla `strategy_adjustments` para revision humana.
 */

export const SELF_CRITIQUE_SYSTEM_PROMPT = `Eres el modulo de autocritica de un bot de alertas de trading que NUNCA ejecuta ordenes:
solo emite alertas informativas basadas en confluencias tecnicas (Smart Money Concepts,
medias moviles, etc.) y registra su resultado real (WIN/LOSS) en una base de datos.

Tu trabajo es actuar como un analista cuantitativo senior que revisa el historial de
señales para encontrar sesgos y patrones de fallo, y proponer ajustes conservadores a
los FILTROS DE RUNTIME (nunca al codigo fuente ni a la logica de entrada en si misma).

Reglas estrictas:
1. Basa tus conclusiones UNICAMENTE en los datos proporcionados. No inventes cifras.
2. Prioriza recomendaciones de alto impacto y bajo riesgo (ej: restringir horarios,
   subir el filtro de volatilidad minima, subir el R:R minimo) sobre cambios agresivos.
3. Si la muestra es demasiado pequeña o no hay una señal estadistica clara, dilo
   explicitamente y no fuerces una recomendacion.
4. Responde EXCLUSIVAMENTE con un objeto JSON valido que cumpla el esquema indicado
   por el usuario. No incluyas texto fuera del JSON, ni bloques markdown.`;

export interface SignalSummaryForPrompt {
  id: string;
  strategyId: string;
  symbol: string;
  direction: string;
  status: string;
  riskReward: number;
  createdAt: string; // ISO
  killzone: string | null;
  dayOfWeekUTC: string;
  hourUTC: number;
  matchedConditions: string[];
  mae: number | null;
  mfe: number | null;
}

export interface CritiqueInputData {
  windowStart: string;
  windowEnd: string;
  totalResolved: number;
  wins: number;
  losses: number;
  winRate: number | null;
  breakdownByKillzone: Record<string, { total: number; wins: number; losses: number; winRate: number }>;
  breakdownByDayOfWeek: Record<string, { total: number; wins: number; losses: number; winRate: number }>;
  breakdownByStrategy: Record<string, { total: number; wins: number; losses: number; winRate: number }>;
  losingSignals: SignalSummaryForPrompt[];
  winningSignals: SignalSummaryForPrompt[];
}

export const RECOMMENDATION_JSON_SCHEMA = `{
  "summary": "string - resumen en español de 3-6 frases de los hallazgos principales",
  "confidence": "low | medium | high",
  "findings": [
    { "pattern": "string - patron detectado, ej. 'señales fuera de Killzone NY fallan 75% de las veces'",
      "supportingSampleSize": "number" }
  ],
  "recommendedFilters": {
    "minATRPercentile": "number|null - percentil minimo de ATR recomendado (0-100), null si no hay cambio",
    "minRiskReward": "number|null - ratio R:R minimo recomendado, null si no hay cambio",
    "blockedKillzones": "string[] - nombres de killzones a bloquear, [] si ninguna",
    "perSymbol": {
      "<SYMBOL>": {
        "minATRPercentile": "number|null",
        "minRiskReward": "number|null",
        "blockedKillzones": "string[]"
      }
    }
  },
  "rationale": "string - por que estos ajustes concretos, citando los datos"
}`;

export function buildSelfCritiqueUserPrompt(data: CritiqueInputData): string {
  return `Analiza el siguiente historial de señales resueltas (ventana: ${data.windowStart} a ${data.windowEnd}).

## Resumen general
- Total resueltas: ${data.totalResolved}
- Ganadoras (WIN): ${data.wins}
- Perdedoras (LOSS): ${data.losses}
- Win rate global: ${data.winRate != null ? (data.winRate * 100).toFixed(1) + "%" : "N/A"}

## Desglose por killzone
${JSON.stringify(data.breakdownByKillzone, null, 2)}

## Desglose por dia de la semana (UTC)
${JSON.stringify(data.breakdownByDayOfWeek, null, 2)}

## Desglose por estrategia
${JSON.stringify(data.breakdownByStrategy, null, 2)}

## Señales perdedoras (detalle)
${JSON.stringify(data.losingSignals, null, 2)}

## Señales ganadoras (detalle, para contraste)
${JSON.stringify(data.winningSignals, null, 2)}

## Tarea
1. Identifica las confluencias/condiciones comunes en las señales PERDEDORAS que no
   aparecen (o aparecen mucho menos) en las GANADORAS: horario, killzone, dia de la
   semana, simbolo, ratio R:R, tipo de condicion que disparo la entrada, etc.
2. Propon ajustes de filtros de runtime CONSERVADORES para reducir esos fallos sin
   eliminar la estrategia. Los unicos parametros que puedes ajustar son:
   minATRPercentile, minRiskReward, blockedKillzones (global y por simbolo).
3. Si la muestra (${data.totalResolved} señales) es menor a la minima estadisticamente
   razonable, indica confidence "low" y evita recomendaciones agresivas.

Responde EXCLUSIVAMENTE con un JSON que cumpla este esquema (sin texto adicional, sin
markdown):
${RECOMMENDATION_JSON_SCHEMA}`;
}
