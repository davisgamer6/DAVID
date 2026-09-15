import { env } from "../src/config/env.js";
import { getDb } from "../src/db/database.js";
import { SignalsRepository } from "../src/db/signalsRepository.js";
import { SignalResolver } from "../src/resolver/signalResolver.js";

const db = getDb(env.sqliteDbPath);
const repo = new SignalsRepository(db);
const resolver = new SignalResolver(repo, env.binanceRestBaseUrl, env.signalResolutionPollMs, (signal, status) => {
  console.log(`Señal ${signal.id} (${signal.symbol}) resuelta como ${status}`);
});

await resolver.tick();
console.log("Ciclo de resolucion ejecutado una vez.");
