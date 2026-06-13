import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, Check, Download, Leaf, Minus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  MODEL_FACTORS,
  PRESETS,
  breakEvenCurve,
  evaluate,
  rankModels,
  type ModelId,
  type Region,
  type Scenario,
  type WaterScope,
} from "../lib/engine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bascule — Rentabilité de l’automatisation IA" },
      {
        name: "description",
        content: "Calculez le coût complet et le seuil de rentabilité d’une automatisation IA.",
      },
      { property: "og:title", content: "Bascule — Rentabilité de l’automatisation IA" },
      {
        property: "og:description",
        content: "Un arbitrage chiffré entre humain, hybride et automatisation IA.",
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

function Index() {
  const [scenario, setScenario] = useState(DEFAULTS);
  const [isExporting, setIsExporting] = useState(false);
  const verdictRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => evaluate(scenario), [scenario]);
  const curve = useMemo(() => breakEvenCurve(scenario), [scenario]);
  const ranking = useMemo(() => rankModels(scenario), [scenario]);
  const setNum = (key: keyof Scenario, value: string) =>
    setScenario((s) => ({ ...s, [key]: Number(value) || 0 }));
  const maxCost = Math.max(result.humanMonthlyCost, result.aiMonthlyCost, 1);
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
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      link.download = `verdict-bascule-${taskSlug || "scenario"}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-5 sm:px-7 lg:px-10">
        <div className="mx-auto flex max-w-[1600px] items-end justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-sm border border-primary/50 bg-positive-soft text-primary">
              <ArrowDown className="size-5" />
            </div>
            <div>
              <p className="text-xl font-semibold tracking-tight">Bascule</p>
              <p className="text-xs text-muted-foreground">Arbitrage opérationnel · IA vs humain</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[10px] text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-positive" /> CALCUL EN TEMPS RÉEL
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[minmax(390px,.8fr)_minmax(600px,1.2fr)]">
        <section className="border-b border-border px-4 py-8 sm:px-7 lg:border-r lg:border-b-0 lg:px-8">
          <Title
            index="01"
            title="Le process à évaluer"
            sub="Paramètres économiques et opérationnels"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScenario(preset)}
                className="rounded-sm border border-border bg-panel px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {preset.taskName}
              </button>
            ))}
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
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
              <N
                value={scenario.humanMinutesPerTask}
                change={(v) => setNum("humanMinutesPerTask", v)}
              />
            </Field>
            <Field label="Coût horaire chargé" suffix="EUR">
              <N
                value={scenario.loadedHourlyCostEur}
                change={(v) => setNum("loadedHourlyCostEur", v)}
              />
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
              <N
                value={scenario.inputTokensPerTask}
                change={(v) => setNum("inputTokensPerTask", v)}
              />
            </Field>
            <Field label="Tokens de sortie / tâche" suffix="tok.">
              <N
                value={scenario.outputTokensPerTask}
                change={(v) => setNum("outputTokensPerTask", v)}
              />
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
              <N
                value={scenario.amortizationMonths}
                min={1}
                change={(v) => setNum("amortizationMonths", v)}
              />
            </Field>
            <Field label="Abonnement mensuel" suffix="EUR">
              <N
                value={scenario.monthlySubscriptionEur}
                change={(v) => setNum("monthlySubscriptionEur", v)}
              />
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
              <div className="flex rounded-sm border border-border bg-panel">
                {(["on-site", "life-cycle"] as WaterScope[]).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setScenario({ ...scenario, waterScope: scope })}
                    className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                      scenario.waterScope === scope
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {scope === "on-site" ? "On-site" : "Cycle de vie"}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </section>

        <section className="px-4 py-8 sm:px-7 lg:px-10">
          <div ref={verdictRef} className="bg-background">
            <Title
              index="02"
              title="Le verdict"
              sub={`Pour « ${scenario.taskName || "cette tâche"} »`}
            />
            <Verdict result={result} />
            <div className="mt-4 border border-border bg-panel px-3 py-4 sm:px-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium">Seuil de bascule</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Coût mensuel selon le volume de tâches
                  </p>
                </div>
                {result.breakEvenVolume !== null && (
                  <span className="shrink-0 rounded-sm bg-positive-soft px-2 py-1 font-mono text-[10px] text-positive">
                    {num.format(result.breakEvenVolume)} tâches/mois
                  </span>
                )}
              </div>
              <div
                className="h-64 w-full"
                aria-label="Courbe du seuil de bascule entre coût humain et coût IA"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curve} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="volume"
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                      tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                      tickFormatter={(value: number) => num.format(value)}
                    />
                    <YAxis
                      width={55}
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                      tickFormatter={(value: number) => `${num.format(value)} €`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      labelFormatter={(value) => `${num.format(Number(value))} tâches/mois`}
                      formatter={(value, name) => [eur.format(Number(value)), name]}
                    />
                    <Legend
                      iconType="plainline"
                      wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                    />
                    {result.breakEvenVolume !== null && (
                      <ReferenceArea
                        x1={result.breakEvenVolume}
                        x2={curve.at(-1)?.volume}
                        fill="var(--positive)"
                        fillOpacity={0.08}
                      />
                    )}
                    {result.breakEvenVolume !== null && (
                      <ReferenceLine
                        x={result.breakEvenVolume}
                        stroke="var(--positive)"
                        strokeDasharray="5 5"
                        label={{
                          value: "Bascule",
                          position: "insideTopRight",
                          fill: "var(--positive)",
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="humanCost"
                      name="Coût humain"
                      stroke="var(--muted-foreground)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="aiCost"
                      name="Coût IA"
                      stroke="var(--positive)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 rounded-sm"
            onClick={exportVerdict}
            disabled={isExporting}
          >
            <Download />
            {isExporting ? "Export en cours…" : "Exporter le verdict en image"}
          </Button>
          <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
            <CostBar label="Humain seul" value={result.humanMonthlyCost} max={maxCost} />
            <CostBar label="IA tout compris" value={result.aiMonthlyCost} max={maxCost} positive />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
            <div className="border-t border-border pt-5">
              <div className="flex justify-between">
                <div>
                  <h3 className="text-sm font-medium">Coût IA par tâche</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Le prix de l’API n’est qu’une fraction du total
                  </p>
                </div>
                <span className="h-fit rounded-sm bg-positive-soft px-2 py-1 font-mono text-[10px] text-positive">
                  API {pct(result.apiShareOfVariableCost)}
                </span>
              </div>
              <div className="mt-5 space-y-4">
                <Break
                  label="Tokens API"
                  value={result.costPerTask.apiTokens}
                  source="tarifs officiels · placeholder"
                  color="bg-positive"
                />
                <Break
                  label="Vérification humaine"
                  value={result.costPerTask.humanReview}
                  source="temps de relecture × coût chargé"
                  color="bg-warning"
                />
                <Break
                  label="Risque d’erreur"
                  value={result.costPerTask.errorRisk}
                  source="taux résiduel × coût d’incident"
                  color="bg-negative"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border xl:grid-cols-1">
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
                label="Économies mensuelles"
                value={eur.format(result.monthlySavings)}
                source="humain − coût IA complet"
                positive={result.monthlySavings >= 0}
              />
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <Leaf className="size-4 text-primary" />
              <h3 className="text-sm font-medium">Empreinte mensuelle</h3>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Foot
                value={`${num.format(result.footprint.energyWh)} Wh`}
                label="Énergie"
                source="arXiv 2505.09598"
              />
              <Foot
                value={`${num.format(result.footprint.waterMl)} mL`}
                label="Eau"
                source={`${scenario.waterScope === "life-cycle" ? "Cycle de vie" : "On-site"} · facteur ${scenario.waterScope === "life-cycle" ? "45" : "1,7"} mL/Wh`}
                highlight
              />
              <Foot
                value={`${num.format(result.footprint.carbonGCo2e)} g`}
                label="CO₂eq"
                source="mix électrique régional"
              />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-sm border border-border bg-panel px-3 py-2">
              <span className="mt-0.5 text-[10px] text-muted-foreground">Fourchette eau :</span>
              <span className="font-mono text-[10px]">
                {num.format(result.footprint.waterMlOnSite)} – {num.format(result.footprint.waterMlLifeCycle)} mL
              </span>
              <span className="ml-auto max-w-[60%] text-[10px] leading-tight text-muted-foreground">
                L’écart reflète le périmètre comptabilisé : refroidissement direct du datacenter (on-site)
                versus fabrication des puces, construction de l’infrastructure et cycle de vie complet (life-cycle).
                Les études sur ce sujet varient d’un facteur 10 à 50.
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="border-t border-border px-4 py-9 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          <Title
            index="03"
            title="Le bon modèle pour cette tâche"
            sub="Classés par coût mensuel total croissant"
          />
          <div className="mt-6 overflow-x-auto border border-border">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-panel-raised text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Rang / modèle</th>
                  <th className="px-5 py-3">Fournisseur</th>
                  <th className="px-5 py-3 text-right">Coût mensuel IA</th>
                  <th className="px-5 py-3 text-right">Économies</th>
                  <th className="px-5 py-3 text-right">Énergie mensuelle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranking.map((r, i) => (
                  <tr key={r.model} className="hover:bg-accent/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm font-medium">{r.modelName}</span>
                        {i === 0 && (
                          <span className="bg-positive-soft px-1.5 py-0.5 text-[9px] uppercase text-positive">
                            Optimal coût
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">{r.provider}</td>
                    <td className="px-5 py-4 text-right font-mono text-sm">
                      {eur.format(r.aiMonthlyCost)}
                    </td>
                    <td
                      className={`px-5 py-4 text-right font-mono text-sm ${r.monthlySavings >= 0 ? "text-positive" : "text-negative"}`}
                    >
                      {eur.format(r.monthlySavings)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-muted-foreground">
                      {num.format(r.footprint.energyWh)} Wh
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Simulation indicative · tarifs et facteurs en placeholder
          </p>
        </div>
      </section>
    </main>
  );
}

function Title({ index, title, sub }: { index: string; title: string; sub: string }) {
  return (
    <div className="flex gap-3">
      <span className="pt-1 font-mono text-[10px] text-primary">{index}</span>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
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
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
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
      className="field pr-14 font-mono"
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
      <span className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{value}%</span>
      </span>
      <div className="flex h-10 items-center rounded-sm border border-input bg-panel-raised px-3">
        <input
          className="w-full"
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
      ? "border-positive/40 bg-positive-soft text-positive"
      : result.recommendation === "HYBRIDE"
        ? "border-warning/40 bg-warning-soft text-warning"
        : "border-negative/40 bg-negative-soft text-negative";
  const Icon =
    result.recommendation === "AUTOMATISER"
      ? Check
      : result.recommendation === "HYBRIDE"
        ? Minus
        : AlertTriangle;
  return (
    <div className={`mt-7 border p-5 sm:p-6 transition-colors duration-500 ease-out ${style}`}>
      <div className="flex gap-4">
        <Icon className="mt-1 size-5 shrink-0 transition-colors duration-500 ease-out" />
        <div>
          <p className="font-mono text-2xl font-semibold transition-colors duration-500 ease-out">{result.recommendation}</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">{result.explanation}</p>
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
    <div className="bg-panel p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl">{eur.format(value)}</p>
      <div className="mt-5 flex h-16 items-end bg-muted/30">
        <div
          className={`w-full ${positive ? "bg-positive" : "bg-foreground/35"}`}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-[9px] text-muted-foreground">
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
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-sm">{eurFine.format(value)}</span>
      </div>
      <div className="mt-2 h-1 bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.max(2, Math.min(100, value * 40))}%` }}
        />
      </div>
      <p className="mt-1.5 text-[9px] text-muted-foreground">{source}</p>
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
    <div className="bg-panel p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-lg ${positive ? "text-positive" : ""}`}>{value}</p>
      <p className="mt-1 text-[9px] text-muted-foreground">{source}</p>
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
    <div className={`border-l border-border pl-3 ${highlight ? "border-l-primary" : ""}`}>
      <p className="font-mono text-sm sm:text-base">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[8px] text-muted-foreground/70">{source}</p>
    </div>
  );
}
function pct(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: value < 0.01 ? 2 : 1,
  }).format(value);
}
