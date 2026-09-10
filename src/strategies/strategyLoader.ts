import fs from "node:fs/promises";
import path from "node:path";
import { Strategy, StrategySchema } from "../types/strategy.js";

/**
 * Lee y valida todos los archivos *.json de un directorio de estrategias.
 * Cada archivo es, en principio, la salida de un pipeline externo que
 * transcribe un video de YouTube y extrae reglas cuantitativas con un LLM.
 * Aqui solo nos importa que el JSON final cumpla StrategySchema: el bot es
 * agnostico al origen del archivo.
 */
export async function loadStrategiesFromDir(dir: string): Promise<Strategy[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    throw new Error(`No se pudo leer el directorio de estrategias "${dir}": ${(err as Error).message}`);
  }

  const jsonFiles = entries.filter((f) => f.toLowerCase().endsWith(".json"));
  const strategies: Strategy[] = [];
  const errors: string[] = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(dir, file);
    try {
      const raw = await fs.readFile(fullPath, "utf-8");
      const parsed = JSON.parse(raw);
      const strategy = StrategySchema.parse(parsed);
      strategies.push(strategy);
    } catch (err) {
      errors.push(`  - ${file}: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[strategyLoader] ${errors.length} archivo(s) de estrategia invalidos, se ignoran:\n${errors.join("\n")}`
    );
  }

  return strategies.filter((s) => s.active);
}

export async function loadStrategyFile(filePath: string): Promise<Strategy> {
  const raw = await fs.readFile(filePath, "utf-8");
  return StrategySchema.parse(JSON.parse(raw));
}
