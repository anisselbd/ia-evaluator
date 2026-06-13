export type ModelId =
  | "claude-opus-4-8"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gpt-5-4"
  | "gemini-2-5-flash-lite"
  | "mistral-small"
  | "other";

export type Region = "france" | "eu" | "usa" | "world";
export type WaterScope = "on-site" | "life-cycle";
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
  humanErrorRate: number;
  errorCostEur: number;
  setupCostEur: number;
  amortizationMonths: number;
  monthlySubscriptionEur: number;
  region: Region;
  waterScope: WaterScope;
}

export const PRESETS: Record<string, Scenario> = {
  sav: {
    taskName: "Répondre à un email SAV",
    monthlyVolume: 500,
    humanMinutesPerTask: 8,
    loadedHourlyCostEur: 35,
    model: "claude-sonnet-4-6",
    inputTokensPerTask: 1200,
    outputTokensPerTask: 350,
    humanReviewRate: 0.4,
    reviewMinutes: 2,
    residualErrorRate: 0.02,
    humanErrorRate: 0.01,
    errorCostEur: 25,
    setupCostEur: 1500,
    amortizationMonths: 12,
    monthlySubscriptionEur: 40,
    region: "france",
    waterScope: "on-site",
  },
  "fiches-produit": {
    taskName: "Rédaction de fiches produit",
    monthlyVolume: 200,
    humanMinutesPerTask: 45,
    loadedHourlyCostEur: 42,
    model: "claude-sonnet-4-6",
    inputTokensPerTask: 2500,
    outputTokensPerTask: 1800,
    humanReviewRate: 0.6,
    reviewMinutes: 8,
    residualErrorRate: 0.03,
    humanErrorRate: 0.01,
    errorCostEur: 80,
    setupCostEur: 3000,
    amortizationMonths: 12,
    monthlySubscriptionEur: 60,
    region: "france",
    waterScope: "on-site",
  },
  "tri-candidatures": {
    taskName: "Tri de candidatures RH",
    monthlyVolume: 300,
    humanMinutesPerTask: 15,
    loadedHourlyCostEur: 45,
    model: "claude-haiku-4-5",
    inputTokensPerTask: 3000,
    outputTokensPerTask: 400,
    humanReviewRate: 0.8,
    reviewMinutes: 5,
    residualErrorRate: 0.01,
    humanErrorRate: 0.01,
    errorCostEur: 200,
    setupCostEur: 2500,
    amortizationMonths: 12,
    monthlySubscriptionEur: 50,
    region: "france",
    waterScope: "on-site",
  },
  // Le cas qui retourne l'intuition : tâche experte où l'humain est rapide et où
  // l'IA exige une relecture quasi totale plus un risque d'erreur coûteux.
  // Résultat : l'IA tout compris coûte PLUS cher que l'ingénieur. Verdict GARDER HUMAIN.
  ingenierie: {
    taskName: "Résoudre un ticket de bug complexe",
    monthlyVolume: 80,
    humanMinutesPerTask: 30,
    loadedHourlyCostEur: 80,
    model: "claude-opus-4-8",
    inputTokensPerTask: 40000,
    outputTokensPerTask: 3000,
    humanReviewRate: 1,
    reviewMinutes: 25,
    residualErrorRate: 0.18,
    humanErrorRate: 0.01,
    errorCostEur: 350,
    setupCostEur: 2000,
    amortizationMonths: 12,
    monthlySubscriptionEur: 80,
    region: "france",
    waterScope: "on-site",
  },
  // Le cas qui vend la voie souveraine : gros volume de longs dossiers CONFIDENTIELS.
  // Beaucoup de tokens d'entrée (40 pages) x volume élevé => le coût API cloud grimpe assez
  // pour que l'infra locale amortie devienne MOINS chère que le cloud. Verdict AUTOMATISER,
  // et le local l'emporte : "vos données restent chez vous, sans surcoût".
  "dossiers-confidentiels": {
    taskName: "Analyser un dossier juridique confidentiel",
    monthlyVolume: 2000,
    humanMinutesPerTask: 35,
    loadedHourlyCostEur: 75,
    model: "claude-opus-4-8",
    inputTokensPerTask: 38000,
    outputTokensPerTask: 2500,
    humanReviewRate: 0.5,
    reviewMinutes: 6,
    residualErrorRate: 0.02,
    humanErrorRate: 0.01,
    errorCostEur: 120,
    setupCostEur: 6000,
    amortizationMonths: 12,
    monthlySubscriptionEur: 90,
    region: "france",
    waterScope: "on-site",
  },
};

export interface CostBreakdownPerTask {
  apiTokens: number;
  humanReview: number;
  errorRisk: number;
}

export interface Footprint {
  energyWh: number;
  waterMl: number;
  waterMlOnSite: number;
  waterMlLifeCycle: number;
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

// Tarifs relevés mi-2026, convertis en EUR depuis les grilles officielles en USD
// (taux 1 USD = 0,92 EUR). Sources : Anthropic pricing (2026-06-04), openai.com/api/pricing,
// ai.google.dev/pricing, mistral.ai/pricing. À revalider le jour J, les prix bougent.
// Énergie : Wh / 1000 tokens, calée sur arXiv:2505.09598 "How Hungry is AI?" (mai 2025)
// et 0,34 Wh/requête moyenne (OpenAI, 2025). Classes : nano ~0,5, small ~1, mid ~1,8, large ~3.
export const MODEL_FACTORS: Record<ModelId, ModelFactors> = {
  "claude-opus-4-8": {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "Anthropic",
    inputEurPerMillionTokens: 4.6, // 5 USD
    outputEurPerMillionTokens: 23, // 25 USD
    energyWhPerThousandTokens: 3.0,
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    inputEurPerMillionTokens: 2.76, // 3 USD
    outputEurPerMillionTokens: 13.8, // 15 USD
    energyWhPerThousandTokens: 1.8,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    inputEurPerMillionTokens: 0.92, // 1 USD
    outputEurPerMillionTokens: 4.6, // 5 USD
    energyWhPerThousandTokens: 1.0,
  },
  "gpt-5-4": {
    id: "gpt-5-4",
    name: "GPT-5.4",
    provider: "OpenAI",
    inputEurPerMillionTokens: 2.3, // 2,5 USD
    outputEurPerMillionTokens: 13.8, // 15 USD
    energyWhPerThousandTokens: 1.8,
  },
  "gemini-2-5-flash-lite": {
    id: "gemini-2-5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    provider: "Google",
    inputEurPerMillionTokens: 0.092, // 0,1 USD
    outputEurPerMillionTokens: 0.368, // 0,4 USD
    energyWhPerThousandTokens: 0.5,
  },
  "mistral-small": {
    id: "mistral-small",
    name: "Mistral Small",
    provider: "Mistral AI",
    inputEurPerMillionTokens: 0.184, // 0,2 USD
    outputEurPerMillionTokens: 0.552, // 0,6 USD
    energyWhPerThousandTokens: 1.0,
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

// Intensité carbone du mix électrique, gCO2eq par Wh (= g/kWh divisé par 1000).
// Sources : RTE eco2mix / Ember 2024. France 56, UE 250, USA 369, Monde 480 g/kWh.
const CARBON_G_PER_WH: Record<Region, number> = {
  france: 0.056,
  eu: 0.25,
  usa: 0.369,
  world: 0.48,
};

const safe = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

export function evaluate(scenario: Scenario): EvaluationResult {
  const model = MODEL_FACTORS[scenario.model];
  const volume = safe(scenario.monthlyVolume);
  const hourlyCost = safe(scenario.loadedHourlyCostEur);
  const reviewRate = Math.min(1, safe(scenario.humanReviewRate));
  const errorRate = Math.min(1, safe(scenario.residualErrorRate));
  const humanErrorRate = Math.min(1, safe(scenario.humanErrorRate));

  // Baseline humain symétrique à l'IA : temps de travail + son propre risque
  // d'erreur, valorisé au MÊME coût d'incident (un incident coûte pareil quelle
  // que soit sa source). On supprime l'asymétrie qui pénalisait l'IA.
  const humanPerTask =
    (safe(scenario.humanMinutesPerTask) / 60) * hourlyCost +
    humanErrorRate * safe(scenario.errorCostEur);
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
    // L'explication colle au facteur réellement en cause, pas à un message générique.
    const pctFr = (x: number) =>
      x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    if (reviewRate >= 0.55) {
      explanation = `Rentable, mais ${pctFr(reviewRate * 100)} % des sorties passent par une relecture humaine : la supervision pèse encore lourd dans l’économie du process.`;
    } else if (errorRate > 0.03) {
      explanation = `Rentable, mais le risque d’erreur résiduel (${pctFr(errorRate * 100)} %) reste trop élevé pour une automatisation totale : on route les cas sensibles vers un humain.`;
    } else {
      explanation =
        "Rentable, mais le gain net est mince : l’automatisation se défend, sans réelle marge de sécurité.";
    }
  } else if (monthlySavings > 0) {
    recommendation = "AUTOMATISER";
    explanation =
      "Le volume absorbe les coûts fixes et dégage une économie robuste, risque inclus.";
  }

  const totalTokensThousands =
    (safe(scenario.inputTokensPerTask) + safe(scenario.outputTokensPerTask)) / 1_000;
  const energyWh = volume * totalTokensThousands * model.energyWhPerThousandTokens;
  // Eau : facteur WUE. On-site ~1,7 mL/Wh (Li et al., arXiv:2304.03271 "Making AI Less Thirsty").
  // Périmètre étendu (production d'électricité incluse) bien supérieur : la littérature va
  // jusqu'à ~519 mL pour une réponse de 100 mots (UC Riverside). 45 mL/Wh comme ordre de grandeur.
  const waterMlOnSite = energyWh * 1.7;
  const waterMlLifeCycle = energyWh * 45;
  const waterMl = scenario.waterScope === "life-cycle" ? waterMlLifeCycle : waterMlOnSite;

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
      waterMl,
      waterMlOnSite,
      waterMlLifeCycle,
      carbonGCo2e: energyWh * CARBON_G_PER_WH[scenario.region],
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

// =============================================================================
// EXTENSIONS : courbe de bascule, score de sobriété, fourchettes d'incertitude.
// Fonctions pures additionnelles, l'interface existante est inchangée.
// =============================================================================

export interface CurvePoint {
  volume: number;
  humanCost: number;
  aiCost: number;
}

// Points pour tracer coût humain vs coût IA selon le volume mensuel, afin de
// visualiser le seuil de bascule (le croisement des deux courbes).
export function breakEvenCurve(scenario: Scenario, points = 24): CurvePoint[] {
  const evalAt = evaluate(scenario);
  const maxVolume = Math.max(
    safe(scenario.monthlyVolume) * 2,
    (evalAt.breakEvenVolume ?? 50) * 2,
    50,
  );
  const step = maxVolume / points;
  const out: CurvePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const volume = Math.round(i * step);
    const r = evaluate({ ...scenario, monthlyVolume: volume });
    out.push({ volume, humanCost: r.humanMonthlyCost, aiCost: r.aiMonthlyCost });
  }
  return out;
}

export interface SobrietyEntry {
  model: ModelId;
  modelName: string;
  provider: string;
  energyWhMonthly: number;
  waterMlOnSiteMonthly: number;
  carbonGCo2eMonthly: number;
  aiMonthlyCost: number;
  // 0 à 100, 100 = le plus sobre (moins d'énergie consommée pour la même tâche).
  sobrietyScore: number;
}

// Classe les modèles par sobriété environnementale pour une tâche donnée.
// Exemple d'idée cité par le brief 07.
export function rankBySobriety(scenario: Scenario): SobrietyEntry[] {
  const entries: SobrietyEntry[] = (Object.values(MODEL_FACTORS) as ModelFactors[])
    .filter((m) => m.id !== "other")
    .map((m) => {
      const r = evaluate({ ...scenario, model: m.id });
      return {
        model: m.id,
        modelName: m.name,
        provider: m.provider,
        energyWhMonthly: r.footprint.energyWh,
        waterMlOnSiteMonthly: r.footprint.waterMlOnSite,
        carbonGCo2eMonthly: r.footprint.carbonGCo2e,
        aiMonthlyCost: r.aiMonthlyCost,
        sobrietyScore: 0,
      };
    });
  const energies = entries.map((e) => e.energyWhMonthly).filter((x) => x > 0);
  const minEnergy = energies.length ? Math.min(...energies) : 0;
  for (const e of entries) {
    e.sobrietyScore =
      e.energyWhMonthly > 0 && minEnergy > 0
        ? Math.round((100 * minEnergy) / e.energyWhMonthly)
        : 100;
  }
  return entries.sort((a, b) => b.sobrietyScore - a.sobrietyScore);
}

export interface RangeValue {
  low: number;
  mid: number;
  high: number;
}

export interface FootprintRange {
  energyWh: RangeValue;
  waterMl: RangeValue;
  carbonGCo2e: RangeValue;
}

// Fourchettes d'incertitude assumées. L'énergie varie largement dans la
// littérature (0,42 à 1,79 Wh pour GPT-4o) : bande [0,55x ; 1,7x] autour du central.
// L'eau dépend surtout du périmètre : borne basse on-site (1,7 mL/Wh), borne haute
// cycle de vie (45 mL/Wh). Le carbone hérite de la bande énergie, à intensité région fixe.
export function footprintRange(scenario: Scenario): FootprintRange {
  const e = evaluate(scenario).footprint.energyWh;
  const intensity = CARBON_G_PER_WH[scenario.region];
  return {
    energyWh: { low: e * 0.55, mid: e, high: e * 1.7 },
    waterMl: { low: e * 1.7, mid: e * ((1.7 + 45) / 2), high: e * 45 },
    carbonGCo2e: {
      low: e * 0.55 * intensity,
      mid: e * intensity,
      high: e * 1.7 * intensity,
    },
  };
}

// =============================================================================
// MODE PORTEFEUILLE : agrège plusieurs process pour piloter l'IA à l'échelle
// d'une entreprise. Le calculateur mono-tâche devient un outil de décision global.
// =============================================================================

export interface PortfolioProcess {
  scenario: Scenario;
  result: EvaluationResult;
}

export interface PortfolioResult {
  processes: PortfolioProcess[];
  humanMonthlyTotal: number;
  aiMonthlyTotal: number;
  monthlySavingsTotal: number;
  savingsRateTotal: number;
  energyWhTotal: number;
  waterMlTotal: number;
  carbonGCo2eTotal: number;
  countAutomate: number;
  countHybrid: number;
  countKeepHuman: number;
}

export function evaluatePortfolio(scenarios: Scenario[]): PortfolioResult {
  const processes: PortfolioProcess[] = scenarios.map((scenario) => ({
    scenario,
    result: evaluate(scenario),
  }));

  const sum = (pick: (p: PortfolioProcess) => number) =>
    processes.reduce((acc, p) => acc + pick(p), 0);

  const humanMonthlyTotal = sum((p) => p.result.humanMonthlyCost);
  const aiMonthlyTotal = sum((p) => p.result.aiMonthlyCost);
  const monthlySavingsTotal = humanMonthlyTotal - aiMonthlyTotal;

  return {
    processes,
    humanMonthlyTotal,
    aiMonthlyTotal,
    monthlySavingsTotal,
    savingsRateTotal:
      humanMonthlyTotal > 0 ? monthlySavingsTotal / humanMonthlyTotal : 0,
    energyWhTotal: sum((p) => p.result.footprint.energyWh),
    waterMlTotal: sum((p) => p.result.footprint.waterMl),
    carbonGCo2eTotal: sum((p) => p.result.footprint.carbonGCo2e),
    countAutomate: processes.filter((p) => p.result.recommendation === "AUTOMATISER").length,
    countHybrid: processes.filter((p) => p.result.recommendation === "HYBRIDE").length,
    countKeepHuman: processes.filter((p) => p.result.recommendation === "GARDER HUMAIN").length,
  };
}

// =============================================================================
// TROISIÈME VOIE : IA LOCALE SOUVERAINE (modèle open-source sur l'infra du client).
// Compare humain / cloud (API) / local (souverain). En local, pas de coût par
// token : à la place, infra GPU amortie + électricité + maintenance. La vérification
// humaine et le risque d'erreur sont identiques (ils dépendent de la tâche, pas du
// déploiement). Données souveraines : rien ne sort vers un fournisseur externe.
// =============================================================================

export interface LocalInfra {
  hardwareCostEur: number; // serveur GPU (achat)
  amortizationMonths: number; // amortissement matériel
  maintenanceMonthlyEur: number; // supervision, MLOps, mises à jour
  gpuPowerW: number; // puissance GPU sous charge
  inferenceSecondsPerTask: number; // durée d'inférence par tâche
  electricityPriceEurPerKWh: number;
}

// Valeurs par défaut réalistes pour un serveur d'inférence pro d'entrée de gamme.
export const DEFAULT_LOCAL_INFRA: LocalInfra = {
  hardwareCostEur: 18000,
  amortizationMonths: 36,
  maintenanceMonthlyEur: 400,
  gpuPowerW: 700,
  inferenceSecondsPerTask: 4,
  electricityPriceEurPerKWh: 0.2,
};

export interface DeploymentOption {
  monthly: number;
  perTaskVariable: number;
  fixedMonthly: number;
}

export interface DeploymentComparison {
  human: { monthly: number };
  cloud: DeploymentOption;
  local: DeploymentOption & { energyWhMonthly: number; carbonGCo2eMonthly: number };
  cheapest: "human" | "cloud" | "local";
  // Surcoût (ou économie) de la souveraineté par rapport au cloud.
  sovereigntyPremiumMonthly: number;
  sovereigntyPremiumRate: number;
  // Volume à partir duquel le local devient aussi avantageux que le cloud.
  // null si le local n'est jamais moins cher (cas fréquent : les tokens API sont
  // déjà dérisoires, donc le local se justifie par la souveraineté, pas le prix).
  localBreakEvenVsCloudVolume: number | null;
}

export function compareDeployments(
  scenario: Scenario,
  infra: LocalInfra = DEFAULT_LOCAL_INFRA,
): DeploymentComparison {
  const model = MODEL_FACTORS[scenario.model];
  const volume = safe(scenario.monthlyVolume);
  const hourlyCost = safe(scenario.loadedHourlyCostEur);
  const reviewRate = Math.min(1, safe(scenario.humanReviewRate));
  const errorRate = Math.min(1, safe(scenario.residualErrorRate));
  const humanErrorRate = Math.min(1, safe(scenario.humanErrorRate));

  // Communs aux deux voies IA (dépendent de la tâche, pas du déploiement).
  const humanReview = reviewRate * (safe(scenario.reviewMinutes) / 60) * hourlyCost;
  const errorRisk = errorRate * safe(scenario.errorCostEur);

  // Humain seul (même terme de risque qu'evaluate, même coût d'incident).
  const humanPerTask =
    (safe(scenario.humanMinutesPerTask) / 60) * hourlyCost +
    humanErrorRate * safe(scenario.errorCostEur);
  const humanMonthly = volume * humanPerTask;

  // Cloud (API, coût par token)
  const cloudTokens =
    (safe(scenario.inputTokensPerTask) / 1_000_000) * model.inputEurPerMillionTokens +
    (safe(scenario.outputTokensPerTask) / 1_000_000) * model.outputEurPerMillionTokens;
  const cloudVar = cloudTokens + humanReview + errorRisk;
  const cloudFixed =
    safe(scenario.monthlySubscriptionEur) +
    safe(scenario.setupCostEur) / Math.max(1, safe(scenario.amortizationMonths));
  const cloudMonthly = volume * cloudVar + cloudFixed;

  // Local souverain (infra amortie + électricité, pas de coût par token)
  const energyWhPerTask = (infra.gpuPowerW * infra.inferenceSecondsPerTask) / 3600;
  const elecPerTask = (energyWhPerTask / 1000) * infra.electricityPriceEurPerKWh;
  const localVar = elecPerTask + humanReview + errorRisk;
  const localFixed =
    infra.hardwareCostEur / Math.max(1, infra.amortizationMonths) + infra.maintenanceMonthlyEur;
  const localMonthly = volume * localVar + localFixed;

  const energyWhMonthly = volume * energyWhPerTask;
  const carbonGCo2eMonthly = energyWhMonthly * CARBON_G_PER_WH[scenario.region];

  const costs: { key: "human" | "cloud" | "local"; v: number }[] = [
    { key: "human", v: humanMonthly },
    { key: "cloud", v: cloudMonthly },
    { key: "local", v: localMonthly },
  ];
  const cheapest = costs.sort((a, b) => a.v - b.v)[0].key;

  // Seuil de bascule cloud -> local
  const varGap = cloudVar - localVar; // ce que le local économise par tâche (tokens évités - élec)
  const fixedGap = localFixed - cloudFixed; // surcoût fixe d'infra du local
  let localBreakEvenVsCloudVolume: number | null = null;
  if (varGap > 0) {
    localBreakEvenVsCloudVolume = fixedGap > 0 ? Math.ceil(fixedGap / varGap) : 0;
  }

  return {
    human: { monthly: humanMonthly },
    cloud: { monthly: cloudMonthly, perTaskVariable: cloudVar, fixedMonthly: cloudFixed },
    local: {
      monthly: localMonthly,
      perTaskVariable: localVar,
      fixedMonthly: localFixed,
      energyWhMonthly,
      carbonGCo2eMonthly,
    },
    cheapest,
    sovereigntyPremiumMonthly: localMonthly - cloudMonthly,
    sovereigntyPremiumRate: cloudMonthly > 0 ? (localMonthly - cloudMonthly) / cloudMonthly : 0,
    localBreakEvenVsCloudVolume,
  };
}
