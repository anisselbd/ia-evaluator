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
const PIN_DISTANCE = 1.8; // multiplicateur de viewport height pour la zone pinnée
const HANDOFF_BG = "#1c474d"; // teinte bleu-pétrole, prolonge la dernière frame (#255a62)

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
  const modeRef = useRef<"loop" | "scrub">("loop");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let mounted = true;
    let cleanup = () => {};

    // Boucle surface vivante : on rembobine à 0 dès qu'on dépasse SURFACE_LOOP_END,
    // mais uniquement en mode loop (jamais pendant le scrub).
    const onTimeUpdate = () => {
      if (modeRef.current === "loop" && video.currentTime >= SURFACE_LOOP_END) {
        video.currentTime = 0;
      }
    };

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (!mounted) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();

      // DESKTOP : pin + scrub déterministe + machine loop↔scrub.
      mm.add("(min-width: 769px) and (prefers-reduced-motion: no-preference)", () => {
        modeRef.current = "loop";
        video.loop = false;
        video.currentTime = 0;
        video.play().catch(() => {});
        video.addEventListener("timeupdate", onTimeUpdate);

        const st = ScrollTrigger.create({
          trigger: heroRef.current,
          start: "top top",
          end: () => "+=" + window.innerHeight * PIN_DISTANCE,
          pin: heroRef.current,
          anticipatePin: 1,
          scrub: true, // un seul lissage : on seek la vidéo directement
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
            // Remap DÉTERMINISTE : 4.5s → 9.5417s, identique à chaque plongée.
            // Le micro-saut vers 4.5s est masqué par la zone du xfade.
            video.currentTime =
              SURFACE_LOOP_END + self.progress * (DIVE_DURATION - SURFACE_LOOP_END);
          },
        });

        // Titre / sous-titre / input : fade + remontée sur les 20 premiers % du pin.
        const fade = gsap.to(contentRef.current, {
          opacity: 0,
          y: -40,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: () => "+=" + window.innerHeight * PIN_DISTANCE * 0.2,
            scrub: true,
          },
        });

        // Révélation décalée des 3 blocs du handoff.
        const reveal = gsap.from(".handoff-block", {
          opacity: 0,
          y: 40,
          duration: 0.7,
          stagger: 0.15,
          ease: "power3.out",
          scrollTrigger: { trigger: ".handoff-section", start: "top 80%" },
        });

        return () => {
          video.removeEventListener("timeupdate", onTimeUpdate);
          fade.scrollTrigger?.kill();
          fade.kill();
          reveal.scrollTrigger?.kill();
          reveal.kill();
          st.kill();
        };
      });

      // MOBILE + REDUCED-MOTION : boucle surface vivante, pas de scrub ni de pin.
      // (poster en secours si l'autoplay est bloqué).
      mm.add("(max-width: 768px), (prefers-reduced-motion: reduce)", () => {
        modeRef.current = "loop";
        video.loop = false;
        video.currentTime = 0;
        video.play().catch(() => {});
        video.addEventListener("timeupdate", onTimeUpdate);
        return () => video.removeEventListener("timeupdate", onTimeUpdate);
      });

      cleanup = () => mm.revert();
    })();

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  return (
    <main className="text-white" style={{ backgroundColor: HANDOFF_BG }}>
      <section ref={heroRef} className="relative h-screen w-full overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          muted
          playsInline
          preload="auto"
          poster="/hero-poster.jpg"
          src="/dive-full.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/35 to-slate-950/80" />

        <div className="absolute inset-x-0 top-0 z-20">
          <HeaderBar light onReset={onReset} />
        </div>

        <div
          ref={contentRef}
          className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center [will-change:transform,opacity]"
        >
          <div className="w-full max-w-2xl">
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
                  <Sparkles className="size-4" />
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
        </div>
      </section>

      <section
        className="handoff-section relative px-4 py-24 sm:px-8"
        style={{ backgroundColor: HANDOFF_BG }}
      >
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-200/70">
            La partie immergée
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Ce qui coûte vraiment dans un projet d’automatisation est sous la surface
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {HANDOFF_BLOCKS.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="handoff-block rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
              >
                <Icon className="size-5 text-cyan-200" />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
