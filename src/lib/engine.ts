export type ModelId =
  | "claude-opus-4-8"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gpt-5-4"
  | "gemini-2-5-flash-lite"
  | "mistral-small"
  | "other";

export type Region = "france" | "eu" | "usa" | "world";
export type Recommendation = "AUTOMATISER" | "HYBRIDE" | "GARDER HUMAIN";

export interface Scenario {
  taskName: string;
  monthlyVolume: number;
  humanMinutesPerTask: number;
  loadedHourlyCostEur: number;
  model: ModelId;
  inputTokensPerTask: number;
  outputTokensPerTask: number;
  humanReviewRate: number;
  reviewMinutes: number;
  residualErrorRate: number;
  errorCostEur: number;
  setupCostEur: number;
  amortizationMonths: number;
  monthlySubscriptionEur: number;
  region: Region;
}

export interface CostBreakdownPerTask {
  apiTokens: number;
  humanReview: number;
  errorRisk: number;
}

export interface Footprint {
  energyWh: number;
  waterMl: number;
  carbonGCo2e: number;
}

export interface EvaluationResult {
  recommendation: Recommendation;
  explanation: string;
  humanMonthlyCost: number;
  aiMonthlyCost: number;
  monthlySavings: number;
  savingsRate: number;
  breakEvenVolume: number | null;
  apiShareOfVariableCost: number;
  costPerTask: CostBreakdownPerTask;
  footprint: Footprint;
}

export interface ModelRanking extends EvaluationResult {
  model: ModelId;
  modelName: string;
  provider: string;
}

interface ModelFactors {
  id: ModelId;
  name: string;
  provider: string;
  inputEurPerMillionTokens: number;
  outputEurPerMillionTokens: number;
  energyWhPerThousandTokens: number;
}

// Valeurs temporaires : remplacez ce registre par vos tarifs et facteurs sourcés.
export const MODEL_FACTORS: Record<ModelId, ModelFactors> = {
  "claude-opus-4-8": {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "Anthropic",
    inputEurPerMillionTokens: 15,
    outputEurPerMillionTokens: 75,
    energyWhPerThousandTokens: 4.8,
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    inputEurPerMillionTokens: 3,
    outputEurPerMillionTokens: 15,
    energyWhPerThousandTokens: 2.1,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    inputEurPerMillionTokens: 0.8,
    outputEurPerMillionTokens: 4,
    energyWhPerThousandTokens: 0.8,
  },
  "gpt-5-4": {
    id: "gpt-5-4",
    name: "GPT-5.4",
    provider: "OpenAI",
    inputEurPerMillionTokens: 2.5,
    outputEurPerMillionTokens: 10,
    energyWhPerThousandTokens: 2.4,
  },
  "gemini-2-5-flash-lite": {
    id: "gemini-2-5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    provider: "Google",
    inputEurPerMillionTokens: 0.1,
    outputEurPerMillionTokens: 0.4,
    energyWhPerThousandTokens: 0.35,
  },
  "mistral-small": {
    id: "mistral-small",
    name: "Mistral Small",
    provider: "Mistral AI",
    inputEurPerMillionTokens: 0.2,
    outputEurPerMillionTokens: 0.6,
    energyWhPerThousandTokens: 0.55,
  },
  other: {
    id: "other",
    name: "Autre modèle",
    provider: "Autre",
    inputEurPerMillionTokens: 1,
    outputEurPerMillionTokens: 3,
    energyWhPerThousandTokens: 1.2,
  },
};

const safe = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

export function evaluate(scenario: Scenario): EvaluationResult {
  const model = MODEL_FACTORS[scenario.model];
  const volume = safe(scenario.monthlyVolume);
  const hourlyCost = safe(scenario.loadedHourlyCostEur);
  const reviewRate = Math.min(1, safe(scenario.humanReviewRate));
  const errorRate = Math.min(1, safe(scenario.residualErrorRate));

  const humanPerTask = (safe(scenario.humanMinutesPerTask) / 60) * hourlyCost;
  const apiTokens =
    (safe(scenario.inputTokensPerTask) / 1_000_000) * model.inputEurPerMillionTokens +
    (safe(scenario.outputTokensPerTask) / 1_000_000) * model.outputEurPerMillionTokens;
  const humanReview = reviewRate * (safe(scenario.reviewMinutes) / 60) * hourlyCost;
  const errorRisk = errorRate * safe(scenario.errorCostEur);
  const variableAiPerTask = apiTokens + humanReview + errorRisk;
  const fixedMonthly =
    safe(scenario.monthlySubscriptionEur) +
    safe(scenario.setupCostEur) / Math.max(1, safe(scenario.amortizationMonths));

  const humanMonthlyCost = volume * humanPerTask;
  const aiMonthlyCost = volume * variableAiPerTask + fixedMonthly;
  const monthlySavings = humanMonthlyCost - aiMonthlyCost;
  const savingsRate = humanMonthlyCost > 0 ? monthlySavings / humanMonthlyCost : 0;
  const marginPerTask = humanPerTask - variableAiPerTask;
  const breakEvenVolume = marginPerTask > 0 ? Math.ceil(fixedMonthly / marginPerTask) : null;

  let recommendation: Recommendation = "GARDER HUMAIN";
  let explanation = "Le coût complet de l’IA dépasse encore celui du traitement humain.";
  if (monthlySavings > 0 && (reviewRate >= 0.55 || errorRate > 0.03 || savingsRate < 0.2)) {
    recommendation = "HYBRIDE";
    explanation =
      "Le gain existe, mais la supervision humaine reste structurante dans l’économie du process.";
  } else if (monthlySavings > 0) {
    recommendation = "AUTOMATISER";
    explanation =
      "Le volume absorbe les coûts fixes et dégage une économie robuste, risque inclus.";
  }

  const totalTokensThousands =
    (safe(scenario.inputTokensPerTask) + safe(scenario.outputTokensPerTask)) / 1_000;
  const energyWh = volume * totalTokensThousands * model.energyWhPerThousandTokens;

  return {
    recommendation,
    explanation,
    humanMonthlyCost,
    aiMonthlyCost,
    monthlySavings,
    savingsRate,
    breakEvenVolume,
    apiShareOfVariableCost: variableAiPerTask > 0 ? apiTokens / variableAiPerTask : 0,
    costPerTask: { apiTokens, humanReview, errorRisk },
    footprint: {
      energyWh,
      waterMl: energyWh * 1.7,
      carbonGCo2e: energyWh * 0.42,
    },
  };
}

export function rankModels(scenario: Scenario): ModelRanking[] {
  return (Object.values(MODEL_FACTORS) as ModelFactors[])
    .filter((model) => model.id !== "other")
    .map((model) => ({
      model: model.id,
      modelName: model.name,
      provider: model.provider,
      ...evaluate({ ...scenario, model: model.id }),
    }))
    .sort((a, b) => a.aiMonthlyCost - b.aiMonthlyCost);
}
