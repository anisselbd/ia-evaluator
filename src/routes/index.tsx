import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Layers,
  Leaf,
  Minus,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MODEL_FACTORS,
  PRESETS,
  breakEvenCurve,
  compareDeployments,
  evaluate,
  evaluatePortfolio,
  rankModels,
  type ModelId,
  type PortfolioResult,
  type Recommendation,
  type Region,
  type Scenario,
  type WaterScope,
} from "../lib/engine";
import { estimateScenario } from "../lib/api/estimate.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIceberg : le vrai coût de l’automatisation IA" },
      {
        name: "description",
        content: "Décrivez un process, AIceberg vous dit s’il faut l’automatiser, avec quel modèle et à quel coût réel.",
      },
      { property: "og:title", content: "AIceberg : le vrai coût de l’automatisation IA" },
      {
        property: "og:description",
        content: "Un arbitrage chiffré entre humain, cloud et IA locale souveraine.",
      },
    ],
  }),
  component: Index,
});

const DEFAULTS: Scenario = {
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
};
const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eurFine = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Borne haute stable du curseur de volume : ~2,5x le volume courant, arrondie,
// avec un plancher pour laisser de la marge sous et au-dessus du seuil.
const niceVolumeMax = (v: number) => Math.max(200, Math.ceil((v * 2.5) / 50) * 50);

const CARD = "rounded-2xl border border-slate-200 bg-white shadow-sm";

function Index() {
  const [scenario, setScenario] = useState(DEFAULTS);
  const [analyzed, setAnalyzed] = useState(false);
  const [portfolio, setPortfolio] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelSort, setModelSort] = useState<"cost" | "energy">("cost");
  const [volumeMax, setVolumeMax] = useState(() => niceVolumeMax(DEFAULTS.monthlyVolume));
  const [isExporting, setIsExporting] = useState(false);
  const [description, setDescription] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateMeta, setEstimateMeta] = useState<{
    assumptions: string[];
    confidence: string;
    costEur: number;
    model: string;
  } | null>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => evaluate(scenario), [scenario]);
  const curve = useMemo(() => breakEvenCurve(scenario), [scenario]);
  const ranking = useMemo(() => rankModels(scenario), [scenario]);
  const deployments = useMemo(() => compareDeployments(scenario), [scenario]);
  const portfolioData = useMemo(() => evaluatePortfolio(Object.values(PRESETS)), []);
  const sortedModels = useMemo(() => {
    const rows = [...ranking];
    return modelSort === "energy"
      ? rows.sort((a, b) => a.footprint.energyWh - b.footprint.energyWh)
      : rows.sort((a, b) => a.aiMonthlyCost - b.aiMonthlyCost);
  }, [ranking, modelSort]);
  const setNum = (key: keyof Scenario, value: string) =>
    setScenario((s) => ({ ...s, [key]: Number(value) || 0 }));
  // Dérivés, consommés depuis les outputs du moteur (aucun recalcul moteur).
  const humanPerTask =
    scenario.monthlyVolume > 0 ? result.humanMonthlyCost / scenario.monthlyVolume : 0;
  const aiSegments = [
    { label: "Tokens API", value: result.costPerTask.apiTokens, color: "bg-emerald-500" },
    { label: "Vérification humaine", value: result.costPerTask.humanReview, color: "bg-amber-500" },
    { label: "Risque d’erreur", value: result.costPerTask.errorRisk, color: "bg-rose-500" },
  ];
  const aiVariablePerTask = aiSegments.reduce((acc, s) => acc + s.value, 0);
  // Coûts fixes mensuels = aiMonthly - part variable (déduit des outputs, pas recalculé).
  const fixedMonthly = result.aiMonthlyCost - scenario.monthlyVolume * aiVariablePerTask;
  const aiFullPerTask =
    scenario.monthlyVolume > 0 ? result.aiMonthlyCost / scenario.monthlyVolume : 0;
  const VerdictIcon =
    result.recommendation === "AUTOMATISER"
      ? Check
      : result.recommendation === "HYBRIDE"
        ? Minus
        : AlertTriangle;

  const runEstimate = async () => {
    if (!description.trim() || estimating) return;
    setEstimating(true);
    setEstimateError(null);
    try {
      const res = await estimateScenario({ data: { description } });
      if (res.ok) {
        setScenario(res.scenario as Scenario);
        setVolumeMax(niceVolumeMax((res.scenario as Scenario).monthlyVolume));
        setEstimateMeta({
          assumptions: res.assumptions,
          confidence: res.confidence,
          costEur: res.estimationCostEur,
          model: res.model,
        });
        setAnalyzed(true);
      } else {
        setEstimateError(res.error);
      }
    } catch {
      setEstimateError("Erreur réseau, réessaie.");
    } finally {
      setEstimating(false);
    }
  };

  const usePreset = (preset: Scenario) => {
    setScenario(preset);
    setVolumeMax(niceVolumeMax(preset.monthlyVolume));
    setEstimateMeta(null);
    setEstimateError(null);
    setAnalyzed(true);
  };
  const manualEntry = () => {
    setEstimateMeta(null);
    setVolumeMax(niceVolumeMax(DEFAULTS.monthlyVolume));
    setAnalyzed(true);
    setAdvancedOpen(true);
  };
  const reset = () => {
    setAnalyzed(false);
    setPortfolio(false);
    setAdvancedOpen(false);
    setDescription("");
    setEstimateMeta(null);
    setEstimateError(null);
    setScenario(DEFAULTS);
    setVolumeMax(niceVolumeMax(DEFAULTS.monthlyVolume));
  };

  const exportVerdict = async () => {
    const node = verdictRef.current;
    if (!node || isExporting) return;
    setIsExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement("a");
      const taskSlug = scenario.taskName
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      link.download = `verdict-aiceberg-${taskSlug || "scenario"}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setIsExporting(false);
    }
  };

  if (portfolio) {
    return <PortfolioView data={portfolioData} onReset={reset} />;
  }

  if (!analyzed) {
    return (
      <LandingHero
        description={description}
        setDescription={setDescription}
        runEstimate={runEstimate}
        estimating={estimating}
        estimateError={estimateError}
        usePreset={usePreset}
        manualEntry={manualEntry}
        onPortfolio={() => setPortfolio(true)}
        onReset={reset}
      />
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-white via-white to-sky-50 text-slate-900">
      <Aurora />
      <div className="relative z-10">
        <HeaderBar onReset={reset} />
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-2 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-500">
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm transition-colors hover:border-indigo-400 hover:text-indigo-700"
            >
              <ArrowLeft className="size-3.5" /> Nouvelle analyse
            </button>
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white shadow-sm transition-colors hover:bg-indigo-600"
            >
              <span className="relative flex h-2 w-2 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Dashboard Live Ops
            </Link>
            {estimateMeta && (
              <span className="text-[11px] text-slate-400">
                Estimé par {estimateMeta.model} · {eurFine.format(estimateMeta.costEur)} · confiance{" "}
                {estimateMeta.confidence}
              </span>
            )}
          </div>

          <div className="mt-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
            <h1 className="text-3xl font-bold tracking-tight">
              {scenario.taskName || "Process à évaluer"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {num.format(scenario.monthlyVolume)} tâches/mois · {MODEL_FACTORS[scenario.model].name} ·{" "}
              {regionLabel(scenario.region)}
            </p>
          </div>

          {/* ===================== NIVEAU 1 : verdict + levier ===================== */}
          <section
            ref={verdictRef}
            className={`mt-5 p-6 ${CARD} animate-in fade-in slide-in-from-bottom-3 duration-500`}
          >
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ${verdictChipClass(result.recommendation)}`}
            >
              <VerdictIcon className="size-4" />
              {result.recommendation}
            </span>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{result.explanation}</p>
            <p
              className={`mt-5 text-5xl font-bold tracking-tight sm:text-6xl ${result.monthlySavings >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {eur.format(Math.abs(result.monthlySavings))}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {result.monthlySavings >= 0 ? "économisés par mois" : "de surcoût par mois"}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Humain <span className="font-semibold text-slate-700">{eur.format(result.humanMonthlyCost)}</span>/mois
              {" · "}IA <span className="font-semibold text-slate-700">{eur.format(result.aiMonthlyCost)}</span>/mois
            </p>
          </section>

          <div className={`mt-3 px-5 py-4 ${CARD}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">Volume de tâches par mois</span>
              <span className="text-sm font-semibold">{num.format(scenario.monthlyVolume)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={volumeMax}
              step={Math.max(1, Math.round(volumeMax / 200))}
              value={Math.min(scenario.monthlyVolume, volumeMax)}
              onChange={(e) => setNum("monthlyVolume", e.target.value)}
              className="mt-2 w-full accent-indigo-600"
              aria-label="Volume de tâches par mois"
            />
            <p className="mt-2 text-xs text-slate-500">
              {result.breakEvenVolume === null ? (
                <>
                  Pas de seuil de bascule : à cette tâche l’IA coûte plus cher que l’humain par tâche,
                  le volume n’y change rien.
                </>
              ) : scenario.monthlyVolume >= result.breakEvenVolume ? (
                <>
                  Seuil de bascule à{" "}
                  <span className="font-semibold text-slate-900">
                    {num.format(result.breakEvenVolume)} tâches/mois
                  </span>
                  . À {num.format(scenario.monthlyVolume)}, vous êtes{" "}
                  <span className="font-semibold text-emerald-600">au-dessus</span> : automatiser est
                  rentable.
                </>
              ) : (
                <>
                  Seuil de bascule à{" "}
                  <span className="font-semibold text-slate-900">
                    {num.format(result.breakEvenVolume)} tâches/mois
                  </span>
                  . À {num.format(scenario.monthlyVolume)}, vous êtes{" "}
                  <span className="font-semibold text-rose-600">en dessous</span> : gardez l’humain
                  pour l’instant.
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={exportVerdict}
            disabled={isExporting}
            className="mt-3 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm transition-colors hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50"
          >
            <Download className="size-3.5" />
            {isExporting ? "Export en cours…" : "Exporter en image"}
          </button>

          {estimateMeta && estimateMeta.assumptions.length > 0 && (
            <Disclosure title="Voir les hypothèses">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {estimateMeta.assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-slate-600">
                    <span className="text-indigo-500">·</span>
                    {a}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          {/* ===================== NIVEAU 2 : levier visuel + bascule ===================== */}
          <Section
            title="Coût variable par tâche"
            sub="Le prix des tokens n’est que la pointe de l’iceberg"
          >
            <CompareBar
              humanPerTask={humanPerTask}
              segments={aiSegments}
              fixedMonthly={fixedMonthly}
              aiFullPerTask={aiFullPerTask}
            />
          </Section>

          <Section title="Seuil de bascule" sub="Coût mensuel selon le volume de tâches">
            <div className={`h-72 w-full px-3 py-4 ${CARD}`} aria-label="Courbe du seuil de bascule">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="volume"
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value: number) => num.format(value)}
                  />
                  <YAxis
                    width={55}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value: number) => `${num.format(value)} €`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      color: "#0f172a",
                      fontSize: 12,
                      boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
                    }}
                    labelFormatter={(value) => `${num.format(Number(value))} tâches/mois`}
                    formatter={(value, name) => [eur.format(Number(value)), name]}
                  />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                  {result.breakEvenVolume !== null && (
                    <ReferenceArea
                      x1={result.breakEvenVolume}
                      x2={curve.at(-1)?.volume}
                      fill="#10b981"
                      fillOpacity={0.08}
                    />
                  )}
                  {result.breakEvenVolume !== null && (
                    <ReferenceLine
                      x={result.breakEvenVolume}
                      stroke="#10b981"
                      strokeDasharray="5 5"
                      label={{ value: "Seuil", position: "insideTopRight", fill: "#10b981", fontSize: 10 }}
                    />
                  )}
                  <ReferenceLine
                    x={scenario.monthlyVolume}
                    stroke="#4f46e5"
                    strokeDasharray="2 2"
                    label={{ value: "Vous", position: "insideTopLeft", fill: "#4f46e5", fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="humanCost"
                    name="Coût humain"
                    stroke="#94a3b8"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="aiCost"
                    name="Coût IA"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* ===================== NIVEAU 3 : détails repliés ===================== */}
          <div className="mt-8">
            <Disclosure title="Choix du modèle" icon={<Sparkles className="size-4 text-indigo-500" />}>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Trier par</span>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  {(
                    [
                      ["cost", "Coût mensuel"],
                      ["energy", "Énergie"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setModelSort(k)}
                      className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                        modelSort === k
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                    <tr className="border-b border-slate-200">
                      <th className="py-3 pr-4">Modèle</th>
                      <th className="px-3 py-3 text-right">Coût/mois</th>
                      <th className="px-3 py-3 text-right">Économies</th>
                      <th className="px-3 py-3 text-right">Énergie</th>
                      <th className="py-3 pl-3 text-right">CO₂eq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedModels.map((r, i) => (
                      <tr key={r.model} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{r.modelName}</span>
                            {i === 0 && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] uppercase text-emerald-700">
                                {modelSort === "cost" ? "Optimal coût" : "Plus sobre"}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">{r.provider}</p>
                        </td>
                        <td className="px-3 py-3 text-right text-sm">{eur.format(r.aiMonthlyCost)}</td>
                        <td
                          className={`px-3 py-3 text-right text-sm ${r.monthlySavings >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                        >
                          {eur.format(r.monthlySavings)}
                        </td>
                        <td className="px-3 py-3 text-right text-sm text-slate-500">
                          {num.format(r.footprint.energyWh)} Wh
                        </td>
                        <td className="py-3 pl-3 text-right text-sm text-slate-500">
                          {num.format(r.footprint.carbonGCo2e)} g
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
                Tarifs officiels mi-2026 · énergie arXiv 2505.09598 · CO₂eq mix{" "}
                {regionLabel(scenario.region)} · à revalider le jour J
              </p>
            </Disclosure>

            <Disclosure title="Cloud ou souverain" icon={<Shield className="size-4 text-indigo-500" />}>
              <DeployCard
                label="IA locale souveraine"
                value={deployments.local.monthly}
                active={deployments.cheapest === "local"}
                badge="Vos données restent chez vous"
              />
              <p className="mt-3 text-[11px] text-slate-500">
                Pour comparaison : Humain{" "}
                <span className="font-medium text-slate-700">{eur.format(deployments.human.monthly)}</span>/mois ·
                Cloud (API){" "}
                <span className="font-medium text-slate-700">{eur.format(deployments.cloud.monthly)}</span>/mois
              </p>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
                {(() => {
                  const be = deployments.localBreakEvenVsCloudVolume;
                  const localUnrealistic =
                    be === null || be > Math.max(scenario.monthlyVolume * 10, 100_000);
                  if (deployments.sovereigntyPremiumMonthly <= 0) {
                    return (
                      <>
                        À ce volume, le souverain est{" "}
                        <span className="font-semibold text-emerald-600">même moins cher</span> que le
                        cloud : vos données restent chez vous sans surcoût.
                      </>
                    );
                  }
                  return (
                    <>
                      La souveraineté coûte{" "}
                      <span className="font-semibold text-slate-900">
                        {eur.format(deployments.sovereigntyPremiumMonthly)}/mois
                      </span>{" "}
                      de plus que le cloud ({pct(deployments.sovereigntyPremiumRate)}).{" "}
                      {localUnrealistic ? (
                        <>
                          Ici les tokens sont si bon marché que le cloud reste imbattable sur le prix :
                          le local se justifie par la souveraineté de vos données, pas par le coût.
                        </>
                      ) : (
                        <>
                          On chiffre le prix de la confidentialité, à vous d’arbitrer. Le local devient
                          plus avantageux dès{" "}
                          <span className="font-semibold text-slate-900">
                            {num.format(be ?? 0)} tâches/mois
                          </span>
                          .
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </Disclosure>

            <Disclosure title="Empreinte détaillée" icon={<Leaf className="size-4 text-emerald-500" />}>
              <div className="grid grid-cols-3 gap-4">
                <Foot
                  value={`${num.format(result.footprint.energyWh)} Wh`}
                  label="Énergie"
                  source="arXiv 2505.09598"
                />
                <Foot
                  value={`${num.format(result.footprint.waterMl)} mL`}
                  label="Eau"
                  source={`${scenario.waterScope === "life-cycle" ? "Cycle de vie" : "On-site"} · ${scenario.waterScope === "life-cycle" ? "45" : "1,7"} mL/Wh`}
                  highlight
                />
                <Foot
                  value={`${num.format(result.footprint.carbonGCo2e)} g`}
                  label="CO₂eq"
                  source="mix électrique régional"
                />
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="mt-0.5 text-[10px] text-slate-400">Fourchette eau :</span>
                <span className="text-[10px] font-medium text-slate-700">
                  {num.format(result.footprint.waterMlOnSite)} à{" "}
                  {num.format(result.footprint.waterMlLifeCycle)} mL
                </span>
                <span className="ml-auto max-w-[62%] text-[10px] leading-tight text-slate-400">
                  L’écart reflète le périmètre : refroidissement direct (on-site) versus cycle de vie
                  complet (fabrication des puces, infrastructure). On affiche la fourchette plutôt
                  qu’un faux chiffre précis.
                </span>
              </div>
            </Disclosure>

            <Disclosure title="Ajuster les paramètres" open={advancedOpen} onToggle={setAdvancedOpen}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nom de la tâche" wide>
                    <input
                      className="field"
                      value={scenario.taskName}
                      onChange={(e) => setScenario({ ...scenario, taskName: e.target.value })}
                    />
                  </Field>
                  <Field label="Volume par mois" suffix="tâches">
                    <N value={scenario.monthlyVolume} change={(v) => setNum("monthlyVolume", v)} />
                  </Field>
                  <Field label="Temps humain / tâche" suffix="min">
                    <N value={scenario.humanMinutesPerTask} change={(v) => setNum("humanMinutesPerTask", v)} />
                  </Field>
                  <Field label="Coût horaire chargé" suffix="EUR">
                    <N value={scenario.loadedHourlyCostEur} change={(v) => setNum("loadedHourlyCostEur", v)} />
                  </Field>
                  <Field label="Modèle IA">
                    <select
                      className="field"
                      value={scenario.model}
                      onChange={(e) => setScenario({ ...scenario, model: e.target.value as ModelId })}
                    >
                      {Object.values(MODEL_FACTORS).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tokens d’entrée / tâche" suffix="tok.">
                    <N value={scenario.inputTokensPerTask} change={(v) => setNum("inputTokensPerTask", v)} />
                  </Field>
                  <Field label="Tokens de sortie / tâche" suffix="tok.">
                    <N value={scenario.outputTokensPerTask} change={(v) => setNum("outputTokensPerTask", v)} />
                  </Field>
                  <Range
                    label="Taux de vérification humaine"
                    value={scenario.humanReviewRate * 100}
                    max={100}
                    change={(v) => setScenario({ ...scenario, humanReviewRate: v / 100 })}
                  />
                  <Field label="Minutes / vérification" suffix="min">
                    <N value={scenario.reviewMinutes} change={(v) => setNum("reviewMinutes", v)} />
                  </Field>
                  <Range
                    label="Taux d’erreur résiduel"
                    value={scenario.residualErrorRate * 100}
                    max={10}
                    step={0.5}
                    change={(v) => setScenario({ ...scenario, residualErrorRate: v / 100 })}
                  />
                  <Range
                    label="Taux d’erreur humain"
                    value={scenario.humanErrorRate * 100}
                    max={10}
                    step={0.5}
                    change={(v) => setScenario({ ...scenario, humanErrorRate: v / 100 })}
                  />
                  <Field label="Coût d’une erreur" suffix="EUR">
                    <N value={scenario.errorCostEur} change={(v) => setNum("errorCostEur", v)} />
                  </Field>
                  <Field label="Coût de mise en place" suffix="EUR">
                    <N value={scenario.setupCostEur} change={(v) => setNum("setupCostEur", v)} />
                  </Field>
                  <Field label="Amortissement" suffix="mois">
                    <N value={scenario.amortizationMonths} min={1} change={(v) => setNum("amortizationMonths", v)} />
                  </Field>
                  <Field label="Abonnement mensuel" suffix="EUR">
                    <N value={scenario.monthlySubscriptionEur} change={(v) => setNum("monthlySubscriptionEur", v)} />
                  </Field>
                  <Field label="Région">
                    <select
                      className="field"
                      value={scenario.region}
                      onChange={(e) => setScenario({ ...scenario, region: e.target.value as Region })}
                    >
                      <option value="france">France</option>
                      <option value="eu">Union européenne</option>
                      <option value="usa">États-Unis</option>
                      <option value="world">Monde</option>
                    </select>
                  </Field>
                  <Field label="Périmètre eau">
                    <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {(["on-site", "life-cycle"] as WaterScope[]).map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => setScenario({ ...scenario, waterScope: scope })}
                          className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                            scenario.waterScope === scope
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                              : "text-slate-500 hover:text-slate-900"
                          }`}
                        >
                          {scope === "on-site" ? "On-site" : "Cycle de vie"}
                        </button>
                      ))}
                    </div>
                  </Field>
              </div>
            </Disclosure>
          </div>
        </div>
      </div>
    </main>
  );
}

function verdictChipClass(rec: Recommendation) {
  return rec === "AUTOMATISER"
    ? "bg-emerald-100 text-emerald-700"
    : rec === "HYBRIDE"
      ? "bg-amber-100 text-amber-700"
      : "bg-rose-100 text-rose-700";
}

function PortfolioView({ data, onReset }: { data: PortfolioResult; onReset: () => void }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-white via-white to-sky-50 text-slate-900">
      <Aurora />
      <div className="relative z-10">
        <HeaderBar onReset={onReset} />
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-2 sm:px-7">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm transition-colors hover:border-indigo-400 hover:text-indigo-700 animate-in fade-in duration-500"
          >
            <ArrowLeft className="size-3.5" /> Retour
          </button>

          <div className="mt-5 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-500">
            <Layers className="size-6 text-indigo-500" />
            <h1 className="text-3xl font-bold tracking-tight">Portefeuille de l’entreprise</h1>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            {data.processes.length} process passés au crible. AIceberg arbitre lesquels automatiser
            et chiffre le gain consolidé, empreinte comprise.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Coût humain / mois"
              value={eur.format(data.humanMonthlyTotal)}
              source="tous process cumulés"
            />
            <Metric
              label="Coût IA / mois"
              value={eur.format(data.aiMonthlyTotal)}
              source="cloud, tout compris"
            />
            <Metric
              label="Économies / mois"
              value={eur.format(data.monthlySavingsTotal)}
              source={`${pct(data.savingsRateTotal)} du coût humain`}
              positive={data.monthlySavingsTotal >= 0}
            />
            <Metric
              label="Arbitrage"
              value={`${data.countAutomate} · ${data.countHybrid} · ${data.countKeepHuman}`}
              source="automatiser · hybride · humain"
            />
          </div>

          <Section title="Empreinte consolidée" icon={<Leaf className="size-4 text-emerald-500" />}>
            <div className={`px-5 py-5 ${CARD}`}>
              <div className="grid grid-cols-3 gap-4">
                <Foot
                  value={`${num.format(data.energyWhTotal)} Wh`}
                  label="Énergie / mois"
                  source="arXiv 2505.09598"
                />
                <Foot
                  value={`${num.format(data.waterMlTotal)} mL`}
                  label="Eau / mois"
                  source="périmètre de chaque process"
                  highlight
                />
                <Foot
                  value={`${num.format(data.carbonGCo2eTotal)} g`}
                  label="CO₂eq / mois"
                  source="mix électrique régional"
                />
              </div>
            </div>
          </Section>

          <Section title="Détail par process" sub="Le verdict d’AIceberg, process par process">
            <div className={`overflow-hidden ${CARD}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <th className="px-5 py-3.5">Process</th>
                      <th className="px-5 py-3.5">Verdict</th>
                      <th className="px-5 py-3.5 text-right">Humain / mois</th>
                      <th className="px-5 py-3.5 text-right">IA / mois</th>
                      <th className="px-5 py-3.5 text-right">Économies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.processes.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium">{p.scenario.taskName}</p>
                          <p className="text-[10px] text-slate-400">
                            {num.format(p.scenario.monthlyVolume)} tâches/mois ·{" "}
                            {MODEL_FACTORS[p.scenario.model].name}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${verdictChipClass(p.result.recommendation)}`}
                          >
                            {p.result.recommendation}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-slate-500">
                          {eur.format(p.result.humanMonthlyCost)}
                        </td>
                        <td className="px-5 py-4 text-right text-sm">
                          {eur.format(p.result.aiMonthlyCost)}
                        </td>
                        <td
                          className={`px-5 py-4 text-right text-sm ${p.result.monthlySavings >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                        >
                          {eur.format(p.result.monthlySavings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
              La même méthode appliquée à chaque process : on automatise ce qui dégage un gain
              robuste, on garde l’humain là où l’IA coûte plus cher.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function HeaderBar({ light, onReset }: { light?: boolean; onReset: () => void }) {
  return (
    <header className="px-5 py-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <button type="button" onClick={onReset} className="flex items-center gap-2 text-left">
          <img src="/logo-aiceberg.png" alt="AIceberg" className="size-9" />
          <span className={`text-lg tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
            <span className={`font-extrabold ${light ? "text-sky-300" : "text-indigo-600"}`}>AI</span>
            <span className="font-semibold">ceberg</span>
          </span>
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors sm:text-sm ${
              light ? "text-white/85 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-medium shadow-lg transition-all hover:scale-[1.03] sm:text-sm ${
              light
                ? "bg-white text-slate-900 shadow-black/20 hover:bg-white/90"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-indigo-500/30"
            }`}
          >
            Inscription
          </button>
        </div>
      </div>
    </header>
  );
}

function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute -left-[8%] -top-[12%] size-[46vw] rounded-full bg-sky-300/40 blur-[120px]"
        style={{ animation: "blob1 18s ease-in-out infinite" }}
      />
      <div
        className="absolute -right-[4%] top-[0%] size-[40vw] rounded-full bg-indigo-300/35 blur-[130px]"
        style={{ animation: "blob2 23s ease-in-out infinite" }}
      />
      <div
        className="absolute bottom-[-15%] left-[20%] size-[44vw] rounded-full bg-blue-200/45 blur-[140px]"
        style={{ animation: "blob3 21s ease-in-out infinite" }}
      />
      <div
        className="absolute bottom-[5%] right-[14%] size-[32vw] rounded-full bg-cyan-200/35 blur-[120px]"
        style={{ animation: "blob1 27s ease-in-out infinite" }}
      />
    </div>
  );
}

function regionLabel(r: Region) {
  return r === "france"
    ? "France"
    : r === "eu"
      ? "Union européenne"
      : r === "usa"
        ? "États-Unis"
        : "Monde";
}

function Section({
  title,
  sub,
  icon,
  children,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Field({
  label,
  suffix,
  wide,
  children,
}: {
  label: string;
  suffix?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <span className="mb-1.5 block text-[11px] font-medium text-slate-500">{label}</span>
      <div className="relative">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
function N({
  value,
  change,
  min = 0,
}: {
  value: number;
  change: (v: string) => void;
  min?: number;
}) {
  return (
    <input
      className="field pr-14"
      type="number"
      min={min}
      value={value}
      onChange={(e) => change(e.target.value)}
    />
  );
}
function Range({
  label,
  value,
  max,
  step = 1,
  change,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  change: (v: number) => void;
}) {
  return (
    <label>
      <span className="mb-1.5 flex justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-900">{value}%</span>
      </span>
      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
        <input
          className="w-full accent-indigo-600"
          type="range"
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(e) => change(Number(e.target.value))}
        />
      </div>
    </label>
  );
}
function Disclosure({
  title,
  icon,
  open: openProp,
  onToggle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  open?: boolean;
  onToggle?: (v: boolean) => void;
  children: ReactNode;
}) {
  const [internal, setInternal] = useState(false);
  const open = openProp ?? internal;
  const toggle = () => (onToggle ? onToggle(!open) : setInternal((o) => !o));
  return (
    <div className={`mt-4 overflow-hidden ${CARD}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-slate-900">{title}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-slate-200 px-5 py-5">{children}</div>}
    </div>
  );
}
function CompareBar({
  humanPerTask,
  segments,
  fixedMonthly,
  aiFullPerTask,
}: {
  humanPerTask: number;
  segments: { label: string; value: number; color: string }[];
  fixedMonthly: number;
  aiFullPerTask: number;
}) {
  const aiTotal = segments.reduce((acc, s) => acc + s.value, 0);
  const max = Math.max(humanPerTask, aiTotal, 1e-9);
  return (
    <div className={`px-5 py-5 ${CARD}`}>
      <div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-600">Humain</span>
          <span className="font-medium">{eurFine.format(humanPerTask)} / tâche</span>
        </div>
        <div className="mt-1.5 h-5 overflow-hidden rounded-lg bg-slate-100">
          <div
            className="h-full rounded-lg bg-slate-300 transition-all duration-700"
            style={{ width: `${(humanPerTask / max) * 100}%` }}
          />
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs">
          <span className="text-slate-600">IA</span>
          <span className="font-medium">{eurFine.format(aiTotal)} / tâche</span>
        </div>
        <div className="mt-1.5 flex h-5 overflow-hidden rounded-lg bg-slate-100">
          {segments.map((s) => (
            <div
              key={s.label}
              className={`h-full ${s.color} transition-all duration-700`}
              style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value > 0 ? "2px" : 0 }}
              title={`${s.label} : ${eurFine.format(s.value)}`}
            />
          ))}
        </div>
        {fixedMonthly > 0 && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            + {eur.format(fixedMonthly)}/mois de coûts fixes (abo + setup amorti), hors de cette barre
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className={`size-2.5 rounded-sm ${s.color}`} />
            {s.label}
            <span className="font-medium text-slate-700">{eurFine.format(s.value)}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        Coût complet par tâche : Humain{" "}
        <span className="font-semibold text-slate-700">{eurFine.format(humanPerTask)}</span> · IA{" "}
        <span className="font-semibold text-slate-700">{eurFine.format(aiFullPerTask)}</span>{" "}
        <span className="text-slate-400">(l’IA inclut alors ses coûts fixes répartis sur le volume)</span>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  source,
  positive,
}: {
  label: string;
  value: string;
  source: string;
  positive?: boolean;
}) {
  return (
    <div className={`p-5 ${CARD}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${positive ? "text-emerald-600" : "text-slate-900"}`}>
        {value}
      </p>
      <p className="mt-1 text-[9px] text-slate-400">{source}</p>
    </div>
  );
}
function Foot({
  value,
  label,
  source,
  highlight,
}: {
  value: string;
  label: string;
  source: string;
  highlight?: boolean;
}) {
  return (
    <div className={`border-l-2 pl-3 ${highlight ? "border-emerald-400" : "border-slate-200"}`}>
      <p className="text-base font-semibold">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 text-[8px] text-slate-400">{source}</p>
    </div>
  );
}
function DeployCard({
  label,
  value,
  active,
  badge,
}: {
  label: string;
  value: number;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`p-5 transition-all ${CARD} ${active ? "ring-2 ring-indigo-500/50" : "hover:border-slate-300"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        {active && (
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] uppercase text-indigo-700">
            Moins cher
          </span>
        )}
      </div>
      <p className="mt-2 text-xl font-semibold">{eur.format(value)}</p>
      {badge && <p className="mt-2 text-[10px] leading-tight text-indigo-600">{badge}</p>}
    </div>
  );
}
function pct(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: value < 0.01 ? 2 : 1,
  }).format(value);
}

// =============================================================================
// HERO SCROLL-DRIVEN : surface vivante au repos, plongée scrubbée au scroll.
// =============================================================================
const SURFACE_LOOP_END = 4.5; // s : fin du segment surface (juste avant le xfade à 4.54)
const DIVE_DURATION = 9.5417; // s : durée réelle de public/dive-full.mp4 (ffprobe)
const PAGE_BG = "#0a2429"; // fond de secours derrière la vidéo (teinte abysse)

const HANDOFF_BLOCKS = [
  {
    Icon: Check,
    title: "Vérification humaine",
    body: "Relire et corriger les sorties de l’IA est presque toujours le poste le plus lourd. On le chiffre tâche par tâche, là où les démos l’ignorent.",
  },
  {
    Icon: AlertTriangle,
    title: "Risque d’erreur",
    body: "Une erreur qui part en production a un coût. On le valorise des deux côtés, humain comme IA, pour un arbitrage honnête plutôt qu’optimiste.",
  },
  {
    Icon: Leaf,
    title: "Empreinte",
    body: "Énergie, eau et CO₂ par tâche, sourcés (arXiv, RTE/Ember) et affichés avec leurs fourchettes d’incertitude assumées, pas un chiffre vert décoratif.",
  },
];

function LandingHero({
  description,
  setDescription,
  runEstimate,
  estimating,
  estimateError,
  usePreset,
  manualEntry,
  onPortfolio,
  onReset,
}: {
  description: string;
  setDescription: (v: string) => void;
  runEstimate: () => void;
  estimating: boolean;
  estimateError: string | null;
  usePreset: (preset: Scenario) => void;
  manualEntry: () => void;
  onPortfolio: () => void;
  onReset: () => void;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<"loop" | "scrub">("loop");
  const smootherRef = useRef<any>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let mounted = true;
    let cleanup = () => {};

    // Boucle surface vivante au repos : on rembobine à 0 dès qu'on dépasse
    // SURFACE_LOOP_END, mais uniquement en mode loop (jamais pendant le scrub).
    const onTimeUpdate = () => {
      if (modeRef.current === "loop" && video.currentTime >= SURFACE_LOOP_END) {
        video.currentTime = 0;
      }
    };

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { ScrollSmoother }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/ScrollSmoother"),
      ]);
      if (!mounted) return;
      gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
      const mm = gsap.matchMedia();

      // DESKTOP : la vidéo de FOND scrub sur TOUTE la hauteur de page (pas de pin,
      // le contenu défile par-dessus). Boucle surface au repos, scrub dès le scroll.
      mm.add("(min-width: 769px) and (prefers-reduced-motion: no-preference)", () => {
        // Scroll inertiel : le contenu glisse en douceur, le scrub vidéo devient soyeux.
        const smoother = ScrollSmoother.create({
          wrapper: "#smooth-wrapper",
          content: "#smooth-content",
          smooth: 1,
          effects: true,
          smoothTouch: 0,
        });
        smootherRef.current = smoother;

        modeRef.current = "loop";
        video.loop = false;
        video.currentTime = 0;
        video.play().catch(() => {});
        video.addEventListener("timeupdate", onTimeUpdate);

        const st = ScrollTrigger.create({
          trigger: pageRef.current,
          start: "top top",
          end: "bottom bottom", // la vidéo défile jusqu'au bas de page
          scrub: true,
          onUpdate: (self) => {
            if (self.progress <= 0.001) {
              if (modeRef.current !== "loop") {
                modeRef.current = "loop";
                if (video.currentTime >= SURFACE_LOOP_END) video.currentTime = 0;
                video.play().catch(() => {});
              }
              return;
            }
            if (modeRef.current !== "scrub") {
              modeRef.current = "scrub";
              video.pause();
            }
            // Remap déterministe : toute la vidéo (0 → fin) sur toute la page.
            video.currentTime = self.progress * DIVE_DURATION;
          },
        });

        // L'input du hero se dissout en remontant quand la 1re vue quitte l'écran.
        const fade = gsap.to(contentRef.current, {
          opacity: 0,
          y: -60,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });

        return () => {
          video.removeEventListener("timeupdate", onTimeUpdate);
          fade.scrollTrigger?.kill();
          fade.kill();
          st.kill();
          smoother.kill();
          smootherRef.current = null;
        };
      });

      // MOBILE + REDUCED-MOTION : boucle surface vivante, pas de scrub.
      // (poster en secours si l'autoplay est bloqué).
      mm.add("(max-width: 768px), (prefers-reduced-motion: reduce)", () => {
        modeRef.current = "loop";
        video.loop = false;
        video.currentTime = 0;
        video.play().catch(() => {});
        video.addEventListener("timeupdate", onTimeUpdate);
        return () => video.removeEventListener("timeupdate", onTimeUpdate);
      });

      // Re-mesure les positions une fois les polices chargées : sinon le tout
      // dernier reveal (près du bas de page) peut ne jamais se déclencher selon
      // le moment où la police arrive et décale la mise en page.
      if (typeof document !== "undefined" && document.fonts) {
        document.fonts.ready.then(() => {
          if (mounted) ScrollTrigger.refresh();
        });
      }
      cleanup = () => mm.revert();
    })();

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  return (
    <main className="relative text-white" style={{ backgroundColor: PAGE_BG }}>
      {/* Fond vidéo FIXE, scrubbé par le scroll, derrière tout le contenu. */}
      <div className="fixed inset-0 z-0">
        <video
          ref={videoRef}
          className="size-full object-cover"
          muted
          playsInline
          preload="auto"
          poster="/hero-poster.jpg"
          src="/dive-full.mp4"
        />
        <div className="absolute inset-0 bg-slate-950/55" />
      </div>

      {/* ScrollSmoother : le contenu (lissé) défile PAR-DESSUS la vidéo fixe. */}
      <div id="smooth-wrapper" className="relative z-10">
        <div id="smooth-content" ref={pageRef}>
        <section
          ref={heroRef}
          className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center"
        >
          <div className="absolute inset-x-0 top-0 z-30">
            <HeaderBar light onReset={onReset} />
          </div>

          <div ref={contentRef} className="w-full max-w-2xl [will-change:transform,opacity]">
            <span className="inline-block rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
              Automatiser, oui. Mais à quel prix ?
            </span>
            <h1 className="mx-auto mt-5 max-w-xl text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl">
              Le vrai coût de l’automatisation
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/80 drop-shadow">
              Décrivez un process. On vous dit s’il faut l’automatiser, avec quel modèle, et combien
              ça coûte vraiment : vérification humaine, risque d’erreur et empreinte compris.
            </p>

            <div className="mt-9 rounded-[28px] border border-white/25 bg-white/10 p-2.5 text-left shadow-2xl shadow-black/40 backdrop-blur-xl transition-colors focus-within:border-white/45">
              <textarea
                className="min-h-[96px] w-full resize-none bg-transparent px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/50"
                placeholder="Ex : automatiser le tri des emails entrants de l’entreprise par importance et par sujet"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runEstimate();
                }}
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <span className="text-[11px] text-white/60">
                  Estimé par Claude Haiku · quelques centièmes de centime
                </span>
                <button
                  type="button"
                  onClick={runEstimate}
                  disabled={estimating || !description.trim()}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {estimating ? "Analyse en cours…" : "Analyser"}
                </button>
              </div>
            </div>
            {estimateError && <p className="mt-3 text-sm text-rose-200">{estimateError}</p>}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-white/60">Exemples :</span>
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => usePreset(preset)}
                  className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs text-white/85 backdrop-blur transition-all hover:scale-[1.04] hover:border-white/45 hover:bg-white/20"
                >
                  {preset.taskName}
                </button>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
              <button
                type="button"
                onClick={manualEntry}
                className="text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                ou saisir les paramètres à la main
              </button>
              <span className="text-white/25">·</span>
              <button
                type="button"
                onClick={onPortfolio}
                className="flex items-center gap-1.5 text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                <Layers className="size-3.5" />
                voir un portefeuille d’entreprise
              </button>
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[11px] text-white/55">
            Défiler pour plonger
            <ChevronDown className="size-4 animate-bounce" />
          </div>
        </section>

          <LandingShowcase
            onCTA={() => {
              const s = smootherRef.current;
              if (s) s.scrollTo(0, true);
              else window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      </div>
    </main>
  );
}

// =============================================================================
// LANDING SHOWCASE : voyage scrollé qui déroule le produit avec les VRAIS
// composants rendus en live dans des cadres navigateur, animés au scroll GSAP.
// Données d'exemple calculées une fois via le moteur (fonctions pures).
// =============================================================================
const DEMO = PRESETS.sav;
const DEMO_RESULT = evaluate(DEMO);
const DEMO_CURVE = breakEvenCurve(DEMO);
const DEMO_HUMAN_PER_TASK = DEMO_RESULT.humanMonthlyCost / DEMO.monthlyVolume;
const DEMO_SEGMENTS = [
  { label: "Tokens API", value: DEMO_RESULT.costPerTask.apiTokens, color: "bg-emerald-500" },
  { label: "Vérification humaine", value: DEMO_RESULT.costPerTask.humanReview, color: "bg-amber-500" },
  { label: "Risque d’erreur", value: DEMO_RESULT.costPerTask.errorRisk, color: "bg-rose-500" },
];
const DEMO_VARIABLE = DEMO_SEGMENTS.reduce((a, s) => a + s.value, 0);
const DEMO_FIXED = DEMO_RESULT.aiMonthlyCost - DEMO.monthlyVolume * DEMO_VARIABLE;
const DEMO_AI_FULL = DEMO_RESULT.aiMonthlyCost / DEMO.monthlyVolume;
const DEMO_DEPLOY = compareDeployments(PRESETS["dossiers-confidentiels"]); // cas où le souverain gagne
const DEMO_PORTFOLIO = evaluatePortfolio(Object.values(PRESETS));

function fmtCount(v: number, kind?: string) {
  return kind === "eur" ? eur.format(v) : num.format(v);
}

// Titre dont chaque mot monte depuis un masque. Découpé en JSX (pas de mutation
// DOM) pour survivre aux re-renders React ; aria-label garde le texte lisible.
function RevealWords({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block overflow-hidden align-bottom pb-[0.12em]"
          style={{ marginBottom: "-0.12em" }}
        >
          <span className="reveal-word inline-block">{word}&nbsp;</span>
        </span>
      ))}
    </span>
  );
}

// Reveal "rideau" : un panneau accent balaie le cadre et le dévoile, avec un
// zoom de réglage. Le cadre est masqué (autoAlpha) au repos côté desktop ; en
// mobile / sans GSAP il reste visible et le panneau reste invisible (scale-x-0).
function RevealFrame({ children }: { children: ReactNode }) {
  return (
    <div className="reveal-frame relative overflow-hidden rounded-2xl shadow-2xl shadow-black/40">
      <div className="reveal-frame-inner [will-change:transform]">{children}</div>
      <div className="reveal-frame-cover pointer-events-none absolute inset-0 origin-left scale-x-0 bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500" />
    </div>
  );
}

function BrowserFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2.5">
        <span className="size-2.5 rounded-full bg-rose-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 truncate text-[10px] text-slate-400">{label}</span>
      </div>
      <div className="bg-white p-4 text-slate-900 sm:p-5">{children}</div>
    </div>
  );
}

function ShowSection({
  kicker,
  title,
  body,
  reverse,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="show-section px-4 py-24 sm:px-8">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div className={reverse ? "lg:order-2" : ""}>
          <p className="reveal-up text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/80">
            {kicker}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight drop-shadow sm:text-3xl">
            <RevealWords text={title} />
          </h2>
          <p className="reveal-up mt-4 max-w-md text-sm leading-relaxed text-white/75">{body}</p>
        </div>
        <div className={`frame-wrap ${reverse ? "lg:order-1" : ""}`}>
          <RevealFrame>{children}</RevealFrame>
        </div>
      </div>
    </section>
  );
}

function LandingShowcase({ onCTA }: { onCTA: () => void }) {
  useEffect(() => {
    let mounted = true;
    let cleanup = () => {};
    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (!mounted) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();
      mm.add("(min-width: 769px) and (prefers-reduced-motion: no-preference)", () => {
        const tweens: any[] = [];
        // Par section : titres mot par mot (montée depuis un masque),
        // kicker / corps / cartes en fondu + flou + remontée, en cascade.
        gsap.utils.toArray<HTMLElement>(".show-section").forEach((sec) => {
          const words = sec.querySelectorAll(".reveal-word");
          if (words.length) {
            tweens.push(
              gsap.from(words, {
                yPercent: 120,
                duration: 0.85,
                stagger: 0.05,
                ease: "power4.out",
                scrollTrigger: { trigger: sec, start: "top 78%" },
              }),
            );
          }
          const ups = sec.querySelectorAll(".reveal-up");
          if (ups.length) {
            tweens.push(
              gsap.from(ups, {
                opacity: 0,
                y: 42,
                filter: "blur(6px)",
                duration: 0.8,
                stagger: 0.1,
                ease: "power2.out",
                scrollTrigger: { trigger: sec, start: "top 75%" },
              }),
            );
          }
        });
        // Cadres : reveal "rideau" — un panneau accent balaie l'écran puis le
        // dévoile (zoom de réglage pendant le dévoilement). Puis parallaxe au scrub.
        gsap.utils.toArray<HTMLElement>(".reveal-frame").forEach((mask) => {
          const inner = mask.querySelector(".reveal-frame-inner");
          const cover = mask.querySelector(".reveal-frame-cover");
          gsap.set(inner, { autoAlpha: 0 });
          const tl = gsap.timeline({ scrollTrigger: { trigger: mask, start: "top 80%" } });
          tl.set(cover, { scaleX: 0, transformOrigin: "left center" })
            .to(cover, { scaleX: 1, duration: 0.45, ease: "power2.in" })
            .set(inner, { autoAlpha: 1 })
            .set(cover, { transformOrigin: "right center" })
            .to(cover, { scaleX: 0, duration: 0.6, ease: "power3.out" })
            .from(inner, { scale: 1.12, duration: 0.9, ease: "power3.out" }, "<");
          tweens.push(tl);
        });
        gsap.utils.toArray<HTMLElement>(".frame-wrap").forEach((el) => {
          tweens.push(
            gsap.to(el, {
              y: -44,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
            }),
          );
        });
        // Compteurs animés (0 → cible) quand ils entrent dans le viewport.
        gsap.utils.toArray<HTMLElement>(".count").forEach((el) => {
          const target = Number(el.dataset.target || 0);
          const kind = el.dataset.kind;
          el.textContent = fmtCount(0, kind);
          const obj = { v: 0 };
          tweens.push(
            gsap.to(obj, {
              v: target,
              duration: 1.6,
              ease: "power1.out",
              scrollTrigger: { trigger: el, start: "top 85%" },
              onUpdate: () => {
                el.textContent = fmtCount(Math.round(obj.v), kind);
              },
            }),
          );
        });
        return () =>
          tweens.forEach((t) => {
            t.scrollTrigger?.kill();
            t.kill();
          });
      });
      // Re-mesure les positions une fois les polices chargées : sinon le tout
      // dernier reveal (près du bas de page) peut ne jamais se déclencher selon
      // le moment où la police arrive et décale la mise en page.
      if (typeof document !== "undefined" && document.fonts) {
        document.fonts.ready.then(() => {
          if (mounted) ScrollTrigger.refresh();
        });
      }
      cleanup = () => mm.revert();
    })();
    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  return (
    <div className="relative text-white">
      {/* 00 — La partie immergée (intro, glass cards sur la vidéo) */}
      <section className="show-section px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="reveal-up text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/80">
            La partie immergée
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight drop-shadow sm:text-3xl">
            <RevealWords text="Ce qui coûte vraiment dans un projet d’automatisation est sous la surface" />
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {HANDOFF_BLOCKS.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="reveal-up rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md"
              >
                <Icon className="size-5 text-cyan-200" />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 01 — Langage naturel → verdict */}
      <ShowSection
        kicker="01 · Langage naturel"
        title="Décrivez un process. On le chiffre."
        body="Pas de tableur, pas de jargon. Une phrase suffit : Claude Haiku en déduit le volume, le temps humain, le risque, et notre moteur tranche."
      >
        <BrowserFrame label="aiceberg.app — analyse">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              « Répondre aux 500 emails SAV par mois et les classer par urgence »
            </div>
            <div className="text-center text-lg text-slate-300">↓</div>
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                <Check className="size-3.5" /> {DEMO_RESULT.recommendation}
              </span>
              <p className="mt-2 text-3xl font-bold text-emerald-600">
                {eur.format(DEMO_RESULT.monthlySavings)}
                <span className="text-sm font-normal text-slate-500"> / mois</span>
              </p>
              <p className="text-xs text-slate-500">économies, vérification et risque inclus</p>
            </div>
          </div>
        </BrowserFrame>
      </ShowSection>

      {/* 02 — Le vrai coût décomposé */}
      <ShowSection
        kicker="02 · Le vrai coût"
        title="Le prix de l’API n’est que la pointe de l’iceberg"
        body="Tokens, vérification humaine, risque d’erreur : on décompose le coût réel par tâche. Le segment vert des tokens est si fin qu’il se lit à peine. C’est le message."
        reverse
      >
        <BrowserFrame label="aiceberg.app — coût par tâche">
          <CompareBar
            humanPerTask={DEMO_HUMAN_PER_TASK}
            segments={DEMO_SEGMENTS}
            fixedMonthly={DEMO_FIXED}
            aiFullPerTask={DEMO_AI_FULL}
          />
        </BrowserFrame>
      </ShowSection>

      {/* 03 — Point de bascule */}
      <ShowSection
        kicker="03 · Point de bascule"
        title="À partir de quel volume l’automatisation devient rentable"
        body="On trace le coût humain contre le coût IA selon le volume. Le croisement, c’est votre seuil de bascule : en dessous, gardez l’humain ; au-dessus, automatisez."
      >
        <BrowserFrame label="aiceberg.app — seuil de bascule">
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={DEMO_CURVE} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="volume"
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => num.format(v)}
                />
                <YAxis
                  width={48}
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${num.format(v)} €`}
                />
                {DEMO_RESULT.breakEvenVolume !== null && (
                  <ReferenceLine
                    x={DEMO_RESULT.breakEvenVolume}
                    stroke="#10b981"
                    strokeDasharray="5 5"
                    label={{ value: "Seuil", position: "insideTopRight", fill: "#10b981", fontSize: 10 }}
                  />
                )}
                <Line type="monotone" dataKey="humanCost" name="Humain" stroke="#94a3b8" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="aiCost" name="IA" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </BrowserFrame>
      </ShowSection>

      {/* 04 — Cloud ou souverain */}
      <ShowSection
        kicker="04 · Déploiement"
        title="Cloud, ou chez vous"
        body="Trois voies chiffrées : humain, IA cloud, IA locale souveraine. Sur des données sensibles à fort volume, le local passe même devant le cloud sur le prix."
        reverse
      >
        <BrowserFrame label="aiceberg.app — cloud ou souverain">
          <div className="grid grid-cols-3 gap-3">
            <DeployCard
              label="Humain"
              value={DEMO_DEPLOY.human.monthly}
              active={DEMO_DEPLOY.cheapest === "human"}
            />
            <DeployCard
              label="IA cloud"
              value={DEMO_DEPLOY.cloud.monthly}
              active={DEMO_DEPLOY.cheapest === "cloud"}
            />
            <DeployCard
              label="Local souverain"
              value={DEMO_DEPLOY.local.monthly}
              active={DEMO_DEPLOY.cheapest === "local"}
              badge="Vos données chez vous"
            />
          </div>
        </BrowserFrame>
      </ShowSection>

      {/* 05 — Portefeuille, compteurs animés */}
      <section className="show-section px-4 py-28 text-center sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="reveal-up text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/80">
            05 · À l’échelle de l’entreprise
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-bold tracking-tight drop-shadow sm:text-3xl">
            <RevealWords text="Tous vos process passés au crible, un seul arbitrage consolidé" />
          </h2>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            <div className="reveal-up">
              <p className="text-4xl font-bold text-cyan-200 sm:text-5xl">
                <span
                  className="count"
                  data-target={Math.round(DEMO_PORTFOLIO.monthlySavingsTotal)}
                  data-kind="eur"
                >
                  {eur.format(DEMO_PORTFOLIO.monthlySavingsTotal)}
                </span>
              </p>
              <p className="mt-2 text-sm text-white/60">d’économies potentielles / mois</p>
            </div>
            <div className="reveal-up">
              <p className="text-4xl font-bold text-cyan-200 sm:text-5xl">
                <span className="count" data-target={DEMO_PORTFOLIO.processes.length} data-kind="num">
                  {num.format(DEMO_PORTFOLIO.processes.length)}
                </span>
              </p>
              <p className="mt-2 text-sm text-white/60">process analysés en un coup d’œil</p>
            </div>
            <div className="reveal-up">
              <p className="text-4xl font-bold text-cyan-200 sm:text-5xl">
                <span className="count" data-target={DEMO_PORTFOLIO.countAutomate} data-kind="num">
                  {num.format(DEMO_PORTFOLIO.countAutomate)}
                </span>
              </p>
              <p className="mt-2 text-sm text-white/60">à automatiser sans hésiter</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="show-section px-4 py-32 text-center sm:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight drop-shadow sm:text-4xl">
            <RevealWords text="Prêt à savoir si vous devez vraiment automatiser ?" />
          </h2>
          <p className="reveal-up mt-4 text-base text-white/75">
            Une phrase, trente secondes, un verdict chiffré et sourcé.
          </p>
          <button
            type="button"
            onClick={onCTA}
            className="reveal-up mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-7 py-3.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.03]"
          >
            <Sparkles className="size-4" />
            Lancer une analyse
          </button>
        </div>
      </section>

      <footer className="relative border-t border-white/10 bg-slate-950/30 px-4 py-12 backdrop-blur-sm sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo-aiceberg.png" alt="AIceberg" className="size-7" />
              <span className="text-base tracking-tight">
                <span className="font-extrabold text-sky-300">AI</span>
                <span className="font-semibold">ceberg</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-white/55">
              Le vrai coût de l’automatisation, chiffré et sourcé. Humain, cloud ou IA locale
              souveraine : on vous aide à trancher.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-white/65">
            <a
              href="https://github.com/anisselbd/ia-evaluator"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              GitHub
            </a>
            <button type="button" onClick={onCTA} className="transition-colors hover:text-white">
              Lancer une analyse
            </button>
            <span className="text-white/45">Vibe Coding Arena · EuraTechnologies · juin 2026</span>
          </nav>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t border-white/5 pt-6 text-[11px] leading-relaxed text-white/40">
          Tarifs et facteurs sourcés (grilles officielles des fournisseurs, arXiv 2505.09598 pour
          l’énergie, RTE / Ember pour le carbone), affichés avec leurs fourchettes d’incertitude et à
          revalider le jour J. © 2026 AIceberg.
        </div>
      </footer>
    </div>
  );
}
