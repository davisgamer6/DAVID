import { env } from "../src/config/env.js";
import { loadStrategiesFromDir } from "../src/strategies/strategyLoader.js";

const strategies = await loadStrategiesFromDir(env.strategiesDir);
console.log(`Se validaron ${strategies.length} estrategia(s) en ${env.strategiesDir}:`);
for (const s of strategies) {
  console.log(`  - ${s.id} (${s.name}) | simbolos: ${s.market.symbols.join(", ")}`);
}
