import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
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
  rankModels,
  type ModelId,
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

const CARD = "rounded-2xl border border-slate-200 bg-white shadow-sm";

function Index() {
  const [scenario, setScenario] = useState(DEFAULTS);
  const [analyzed, setAnalyzed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  const setNum = (key: keyof Scenario, value: string) =>
    setScenario((s) => ({ ...s, [key]: Number(value) || 0 }));
  const maxCost = Math.max(result.humanMonthlyCost, result.aiMonthlyCost, 1);

  const runEstimate = async () => {
    if (!description.trim() || estimating) return;
    setEstimating(true);
    setEstimateError(null);
    try {
      const res = await estimateScenario({ data: { description } });
      if (res.ok) {
        setScenario(res.scenario as Scenario);
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
    setEstimateMeta(null);
    setEstimateError(null);
    setAnalyzed(true);
  };
  const manualEntry = () => {
    setEstimateMeta(null);
    setAnalyzed(true);
    setAdvancedOpen(true);
  };
  const reset = () => {
    setAnalyzed(false);
    setAdvancedOpen(false);
    setDescription("");
    setEstimateMeta(null);
    setEstimateError(null);
    setScenario(DEFAULTS);
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

  if (!analyzed) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <video
          className="absolute inset-0 size-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src="/hero-iceberg.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/35 to-slate-950/75" />
        <div className="relative z-10 flex min-h-screen flex-col">
          <HeaderBar light onReset={reset} />
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
            <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-6 duration-700">
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
              <button
                type="button"
                onClick={manualEntry}
                className="mt-7 text-xs text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                ou saisir les paramètres à la main
              </button>
            </div>
          </div>
        </div>
      </main>
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

          {estimateMeta && estimateMeta.assumptions.length > 0 && (
            <div className={`mt-5 px-5 py-4 ${CARD} animate-in fade-in duration-500`}>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                Hypothèses retenues par l’IA
              </p>
              <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                {estimateMeta.assumptions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-slate-600">
                    <span className="text-indigo-500">·</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div ref={verdictRef} className="mt-6 rounded-3xl bg-white/40 p-1">
            <Verdict result={result} />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Metric
                label="Économies mensuelles"
                value={eur.format(result.monthlySavings)}
                source="humain moins coût IA complet"
                positive={result.monthlySavings >= 0}
              />
              <Metric
                label="Seuil de bascule"
                value={
                  result.breakEvenVolume === null
                    ? "Non atteint"
                    : `${num.format(result.breakEvenVolume)} tâches/mois`
                }
                source="coûts fixes ÷ marge unitaire"
              />
              <Metric
                label="Part de l’API"
                value={pct(result.apiShareOfVariableCost)}
                source="tout le reste est humain"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <CostBar label="Humain seul" value={result.humanMonthlyCost} max={maxCost} />
              <CostBar label="IA tout compris" value={result.aiMonthlyCost} max={maxCost} positive />
            </div>
          </div>
          <button
            type="button"
            onClick={exportVerdict}
            disabled={isExporting}
            className="mt-3 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm transition-colors hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50"
          >
            <Download className="size-3.5" />
            {isExporting ? "Export en cours…" : "Exporter le verdict en image"}
          </button>

          <Section
            title="La partie immergée"
            sub="Le prix de l’API n’est que la pointe de l’iceberg"
          >
            <div className={`space-y-4 px-5 py-5 ${CARD}`}>
              <Break
                label="Tokens API"
                value={result.costPerTask.apiTokens}
                source="tarifs officiels USD convertis en EUR"
                color="bg-emerald-500"
              />
              <Break
                label="Vérification humaine"
                value={result.costPerTask.humanReview}
                source="temps de relecture × coût chargé"
                color="bg-amber-500"
              />
              <Break
                label="Risque d’erreur"
                value={result.costPerTask.errorRisk}
                source="taux résiduel × coût d’incident"
                color="bg-rose-500"
              />
            </div>
          </Section>

          <Section
            title="Cloud ou souverain ?"
            sub="Si vous automatisez, comment déployer le modèle"
            icon={<Shield className="size-4 text-indigo-500" />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <DeployCard
                label="Humain seul"
                value={deployments.human.monthly}
                active={deployments.cheapest === "human"}
              />
              <DeployCard
                label="IA cloud (API)"
                value={deployments.cloud.monthly}
                active={deployments.cheapest === "cloud"}
              />
              <DeployCard
                label="IA locale souveraine"
                value={deployments.local.monthly}
                active={deployments.cheapest === "local"}
                badge="Vos données restent chez vous"
              />
            </div>
            <div className={`mt-3 px-4 py-3 text-[13px] leading-relaxed text-slate-600 ${CARD}`}>
              {deployments.sovereigntyPremiumMonthly > 0 ? (
                <>
                  La souveraineté coûte{" "}
                  <span className="font-semibold text-slate-900">
                    {eur.format(deployments.sovereigntyPremiumMonthly)}/mois
                  </span>{" "}
                  de plus que le cloud ({pct(deployments.sovereigntyPremiumRate)}). On chiffre le prix
                  de la confidentialité, à vous d’arbitrer.
                </>
              ) : (
                <>
                  À ce volume, le souverain est{" "}
                  <span className="font-semibold text-emerald-600">même moins cher</span> que le cloud.
                </>
              )}
              {deployments.localBreakEvenVsCloudVolume !== null &&
                deployments.localBreakEvenVsCloudVolume > 0 && (
                  <>
                    {" "}
                    Le local devient plus avantageux dès{" "}
                    <span className="font-semibold text-slate-900">
                      {num.format(deployments.localBreakEvenVsCloudVolume)} tâches/mois
                    </span>
                    .
                  </>
                )}
            </div>
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

          <Section title="Empreinte mensuelle" icon={<Leaf className="size-4 text-emerald-500" />}>
            <div className={`px-5 py-5 ${CARD}`}>
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
            </div>
          </Section>

          <Section title="Le bon modèle pour cette tâche" sub="Classés par coût mensuel total croissant">
            <div className={`overflow-hidden ${CARD}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-400">
                    <tr className="border-b border-slate-200 bg-slate-50/60">
                      <th className="px-5 py-3.5">Rang / modèle</th>
                      <th className="px-5 py-3.5">Fournisseur</th>
                      <th className="px-5 py-3.5 text-right">Coût mensuel IA</th>
                      <th className="px-5 py-3.5 text-right">Économies</th>
                      <th className="px-5 py-3.5 text-right">Énergie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.model} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                            <span className="text-sm font-medium">{r.modelName}</span>
                            {i === 0 && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] uppercase text-emerald-700">
                                Optimal coût
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{r.provider}</td>
                        <td className="px-5 py-4 text-right text-sm">{eur.format(r.aiMonthlyCost)}</td>
                        <td
                          className={`px-5 py-4 text-right text-sm ${r.monthlySavings >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                        >
                          {eur.format(r.monthlySavings)}
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-slate-500">
                          {num.format(r.footprint.energyWh)} Wh
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
              Tarifs officiels mi-2026 · énergie arXiv 2505.09598 · à revalider le jour J
            </p>
          </Section>

          <div className={`mt-8 overflow-hidden ${CARD}`}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium transition-colors hover:bg-slate-50"
            >
              Ajuster les paramètres
              <ChevronDown className={`size-4 text-slate-400 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </button>
            {advancedOpen && (
              <div className="border-t border-slate-200 px-5 py-5">
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
              </div>
            )}
          </div>
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
          <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
            <span className={light ? "text-sky-300" : "text-indigo-600"}>AI</span>ceberg
          </span>
        </button>
        <span
          className={`hidden items-center gap-2 text-[11px] sm:flex ${light ? "text-white/70" : "text-slate-400"}`}
        >
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Calcul en temps réel
        </span>
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
function Verdict({ result }: { result: ReturnType<typeof evaluate> }) {
  const style =
    result.recommendation === "AUTOMATISER"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-700"
      : result.recommendation === "HYBRIDE"
        ? "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700"
        : "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-700";
  const Icon =
    result.recommendation === "AUTOMATISER"
      ? Check
      : result.recommendation === "HYBRIDE"
        ? Minus
        : AlertTriangle;
  return (
    <div className={`rounded-3xl border p-6 shadow-sm transition-colors duration-500 ${style}`}>
      <div className="flex gap-4">
        <Icon className="mt-1 size-6 shrink-0" />
        <div>
          <p className="text-3xl font-bold tracking-tight">{result.recommendation}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{result.explanation}</p>
        </div>
      </div>
    </div>
  );
}
function CostBar({
  label,
  value,
  max,
  positive,
}: {
  label: string;
  value: number;
  max: number;
  positive?: boolean;
}) {
  return (
    <div className={`p-5 ${CARD}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{eur.format(value)}</p>
      <div className="mt-4 flex h-12 items-end overflow-hidden rounded-lg bg-slate-100">
        <div
          className={`w-full rounded-t-lg transition-all duration-700 ease-out ${positive ? "bg-gradient-to-t from-blue-600 to-indigo-500" : "bg-slate-300"}`}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-[9px] text-slate-400">
        {positive ? "API + contrôle + risque + fixe" : "coût horaire chargé × temps"}
      </p>
    </div>
  );
}
function Break({
  label,
  value,
  source,
  color,
}: {
  label: string;
  value: number;
  source: string;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-sm font-medium">{eurFine.format(value)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.max(2, Math.min(100, value * 40))}%` }}
        />
      </div>
      <p className="mt-1.5 text-[9px] text-slate-400">{source}</p>
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
