import { env, required } from "../src/config/env.js";
import { getDb } from "../src/db/database.js";
import { SignalsRepository, StrategyAdjustmentsRepository } from "../src/db/signalsRepository.js";
import { ClaudeClient } from "../src/learning/claudeClient.js";
import { runFeedbackLoop } from "../src/learning/claudeFeedbackLoop.js";

const apiKey = required("ANTHROPIC_API_KEY");

const db = getDb(env.sqliteDbPath);
const signalsRepo = new SignalsRepository(db);
const adjustmentsRepo = new StrategyAdjustmentsRepository(db);
const claude = new ClaudeClient(apiKey, env.claudeModel);

const result = await runFeedbackLoop(signalsRepo, adjustmentsRepo, claude, {
  windowHours: env.feedbackLoopIntervalHours,
  minSamples: env.feedbackLoopMinSamples,
  autoApply: env.feedbackLoopAutoApply,
  runtimeFiltersPath: env.runtimeFiltersPath,
});

if (!result.ran) {
  console.log(`Bucle de aprendizaje no ejecutado: ${result.reason}`);
}
