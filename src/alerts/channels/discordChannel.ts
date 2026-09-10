import { SignalCandidate, DIRECTION_LABEL } from "../../types/signal.js";

/** Envia la alerta como un embed a un webhook de Discord (solo escritura de mensajes). */
export async function sendDiscordAlert(webhookUrl: string, candidate: SignalCandidate): Promise<void> {
  const label = DIRECTION_LABEL[candidate.direction];
  const color = label.color === "green" ? 0x22c55e : 0xef4444;

  const body = {
    embeds: [
      {
        title: `${label.text} · ${candidate.symbol}`,
        color,
        fields: [
          { name: "Estrategia", value: candidate.strategyId, inline: false },
          { name: "Entrada", value: String(candidate.entryPrice), inline: true },
          { name: "Stop Loss", value: String(candidate.stopLoss), inline: true },
          { name: "Take Profit", value: String(candidate.takeProfit), inline: true },
          { name: "R:R", value: candidate.riskReward.toFixed(2), inline: true },
          { name: "Killzone", value: candidate.context.killzone ?? "-", inline: true },
          { name: "Confluencias", value: candidate.context.matchedConditions.join("\n") || "-", inline: false },
        ],
        footer: { text: "Alerta informativa - no ejecuta ordenes" },
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error enviando alerta a Discord: HTTP ${res.status} - ${text}`);
  }
}
