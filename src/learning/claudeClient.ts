import Anthropic from "@anthropic-ai/sdk";

export interface ClaudeRecommendation {
  summary: string;
  confidence: "low" | "medium" | "high";
  findings: Array<{ pattern: string; supportingSampleSize: number }>;
  recommendedFilters: {
    minATRPercentile: number | null;
    minRiskReward: number | null;
    blockedKillzones: string[];
    perSymbol?: Record<
      string,
      { minATRPercentile: number | null; minRiskReward: number | null; blockedKillzones: string[] }
    >;
  };
  rationale: string;
}

export class ClaudeClient {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async requestSelfCritique(systemPrompt: string, userPrompt: string): Promise<ClaudeRecommendation> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude no devolvio contenido de texto");
    }

    return this.parseJsonResponse(textBlock.text);
  }

  private parseJsonResponse(text: string): ClaudeRecommendation {
    const cleaned = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(cleaned) as ClaudeRecommendation;
    } catch (err) {
      throw new Error(`No se pudo parsear la respuesta JSON de Claude: ${(err as Error).message}\nRespuesta: ${text}`);
    }
  }
}
