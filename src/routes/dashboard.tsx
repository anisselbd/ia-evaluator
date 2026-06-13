import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, Activity, Euro, Zap } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

// Génération de fausses données (Mock) pour les 30 derniers jours
function generateMockData() {
  const data = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    
    // Variabilité aléatoire
    const baseCalls = 1000 + Math.random() * 500;
    const calls = Math.floor(i % 7 === 0 || i % 7 === 1 ? baseCalls * 0.3 : baseCalls); // Baisse le week-end
    const cost = (calls / 1000) * 15 + Math.random() * 5; // Environ 15 EUR par 1000 appels
    const latency = 150 + Math.random() * 80 + (calls > 1300 ? 100 : 0); // Latence augmente sous la charge

    data.push({
      date: dateStr,
      appels: calls,
      cout: Number(cost.toFixed(2)),
      latence: Number(latency.toFixed(0)),
    });
  }
  return data;
}

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

const CARD = "rounded-2xl border border-slate-200 bg-white shadow-sm p-5";

function Dashboard() {
  const data = useMemo(() => generateMockData(), []);
  
  const totalCalls = data.reduce((acc, curr) => acc + curr.appels, 0);
  const totalCost = data.reduce((acc, curr) => acc + curr.cout, 0);
  const avgLatency = data.reduce((acc, curr) => acc + curr.latence, 0) / data.length;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900 pb-16">
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-7">
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm transition-colors hover:border-indigo-400 hover:text-indigo-700"
          >
            <ArrowLeft className="size-3.5" /> Retour au simulateur
          </Link>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Live Ops</span>
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard de Production</h1>
        <p className="text-sm text-slate-500 mb-8">Supervision de votre flotte IA sur les 30 derniers jours.</p>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className={CARD}>
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <Activity className="size-5" />
              <h2 className="text-sm font-semibold">Volume d'appels</h2>
            </div>
            <p className="text-3xl font-bold">{num.format(totalCalls)}</p>
            <p className="text-xs text-slate-400 mt-1">Requêtes API traitées</p>
          </div>
          <div className={CARD}>
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <Euro className="size-5" />
              <h2 className="text-sm font-semibold">Coût API Cumulé</h2>
            </div>
            <p className="text-3xl font-bold">{eur.format(totalCost)}</p>
            <p className="text-xs text-slate-400 mt-1">Facturation estimée</p>
          </div>
          <div className={CARD}>
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <Zap className="size-5" />
              <h2 className="text-sm font-semibold">Latence Moyenne</h2>
            </div>
            <p className="text-3xl font-bold">{avgLatency.toFixed(0)} ms</p>
            <p className="text-xs text-slate-400 mt-1">Temps de réponse du modèle</p>
          </div>
        </div>

        {/* Graphiques */}
        <div className="grid gap-6">
          <div className={`${CARD} h-80`}>
            <h3 className="text-sm font-semibold mb-4 text-slate-700">Volume d'appels quotidiens</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={10} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="appels" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Requêtes" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className={`${CARD} h-72`}>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Coûts API (EUR)</h3>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={10} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="cout" stroke="#10b981" fillOpacity={1} fill="url(#colorCost)" name="Coût (€)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className={`${CARD} h-72`}>
              <h3 className="text-sm font-semibold mb-4 text-slate-700">Latence (ms)</h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={10} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="latence" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 6 }} name="Latence (ms)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
