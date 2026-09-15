import { SignalCandidate } from "../types/signal.js";
import { sendConsoleAlert } from "./channels/consoleChannel.js";
import { sendTelegramAlert } from "./channels/telegramChannel.js";
import { sendDiscordAlert } from "./channels/discordChannel.js";

export interface AlertDispatcherConfig {
  channels: string[];
  telegramBotToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
}

/**
 * Punto unico de salida "operativa" del sistema: SOLO alertas informativas.
 * No existe metodo alguno aqui capaz de llamar a un endpoint de trading.
 */
export class AlertDispatcher {
  constructor(private readonly config: AlertDispatcherConfig) {}

  async dispatch(candidate: SignalCandidate): Promise<void> {
    const jobs: Promise<void>[] = [];

    if (this.config.channels.includes("console")) {
      sendConsoleAlert(candidate);
    }
    if (this.config.channels.includes("telegram") && this.config.telegramBotToken && this.config.telegramChatId) {
      jobs.push(sendTelegramAlert(this.config.telegramBotToken, this.config.telegramChatId, candidate));
    }
    if (this.config.channels.includes("discord") && this.config.discordWebhookUrl) {
      jobs.push(sendDiscordAlert(this.config.discordWebhookUrl, candidate));
    }

    const results = await Promise.allSettled(jobs);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[AlertDispatcher] Fallo al enviar alerta:", result.reason);
      }
    }
  }
}
