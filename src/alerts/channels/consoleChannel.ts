import chalk from "chalk";
import { SignalCandidate } from "../../types/signal.js";
import { DIRECTION_LABEL } from "../../types/signal.js";

export function sendConsoleAlert(candidate: SignalCandidate): void {
  const label = DIRECTION_LABEL[candidate.direction];
  const tag = label.color === "green" ? chalk.bgGreen.black(` ${label.text} `) : chalk.bgRed.white(` ${label.text} `);

  console.log(
    `\n${tag} ${chalk.bold(candidate.symbol)} | estrategia: ${candidate.strategyId}\n` +
      `  Entrada: ${candidate.entryPrice}  SL: ${candidate.stopLoss}  TP: ${candidate.takeProfit}  R:R: ${candidate.riskReward.toFixed(2)}\n` +
      `  Killzone: ${candidate.context.killzone ?? "-"}  Score: ${(candidate.context.score * 100).toFixed(0)}%\n` +
      `  Confluencias: ${candidate.context.matchedConditions.join(" | ")}\n`
  );
}
