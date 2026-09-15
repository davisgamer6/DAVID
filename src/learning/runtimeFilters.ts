import fs from "node:fs/promises";
import fsSync from "node:fs";

/**
 * "Filtros de runtime": el UNICO canal por el que el bucle de aprendizaje de
 * Claude puede influir en el comportamiento del bot. Es un archivo de datos,
 * no codigo. El motor de estrategias (strategyEngine.ts) lo lee en cada
 * evaluacion y lo combina con las reglas del JSON de la estrategia original,
 * SIN que el codigo fuente ni el estrategia.json deban modificarse nunca.
 */
export interface RuntimeFilters {
  updatedAt?: string;
  minATRPercentile?: number;
  minRiskReward?: number;
  blockedKillzones?: string[];
  perSymbol?: Record<
    string,
    {
      minATRPercentile?: number;
      minRiskReward?: number;
      blockedKillzones?: string[];
    }
  >;
  notes?: string;
}

export function loadRuntimeFiltersSync(path: string): RuntimeFilters {
  if (!fsSync.existsSync(path)) return {};
  try {
    return JSON.parse(fsSync.readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

export async function loadRuntimeFilters(path: string): Promise<RuntimeFilters> {
  try {
    const raw = await fs.readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveRuntimeFilters(path: string, filters: RuntimeFilters): Promise<void> {
  const payload: RuntimeFilters = { ...filters, updatedAt: new Date().toISOString() };
  await fs.writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
}
