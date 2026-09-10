import { SignalCandidate, DIRECTION_LABEL } from "../../types/signal.js";

/**
 * Envia un mensaje informativo a Telegram usando sendMessage.
 * El bot de Telegram usado aqui SOLO necesita permiso para enviar mensajes:
 * no tiene ninguna relacion con el exchange y no puede operar nada.
 */
export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  candidate: SignalCandidate
): Promise<void> {
  const label = DIRECTION_LABEL[candidate.direction];
  const emoji = label.color === "green" ? "🟢" : "🔴";
  const text =
    `${emoji} *${label.text}* \\- ${candidate.symbol}\n` +
    `Estrategia: \`${candidate.strategyId}\`\n` +
    `Entrada: \`${candidate.entryPrice}\`\n` +
    `SL: \`${candidate.stopLoss}\`  TP: \`${candidate.takeProfit}\`\n` +
    `R:R: \`${candidate.riskReward.toFixed(2)}\`\n` +
    `Killzone: ${candidate.context.killzone ?? "-"}\n` +
    `Confluencias: ${candidate.context.matchedConditions.join(", ")}\n\n` +
    `_Alerta informativa. No implica ejecucion automatica de ordenes._`;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Error enviando alerta a Telegram: HTTP ${res.status} - ${body}`);
  }
}
