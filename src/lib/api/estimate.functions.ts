import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Server function : transforme une description en langage naturel d'un process
// métier en un scénario chiffré, avec ses hypothèses affichées. Tourne côté
// serveur uniquement (la clé API ne part jamais au navigateur).
//
// Choix produit : Claude Haiku 4.5, le plus petit et le plus rapide. L'extraction
// de paramètres est une tâche simple, et c'est cohérent avec le message du produit
// (un petit modèle sobre suffit). Passe à "claude-sonnet-4-6" pour plus de finesse.
const ESTIMATION_MODEL = "claude-haiku-4-5";

// Tarif Haiku 4.5 pour chiffrer le coût de l'estimation elle-même (méta) :
// 1 / 5 USD par million de tokens, convertis en EUR à 0,92.
const HAIKU_IN_EUR_PER_M = 0.92;
const HAIKU_OUT_EUR_PER_M = 4.6;

// Validation de la sortie du modèle : exactement la forme Scenario du moteur,
// plus les hypothèses. zod garantit la forme et nettoie les valeurs.
const EstimateSchema = z.object({
  taskName: z.string(),
  monthlyVolume: z.number(),
  humanMinutesPerTask: z.number(),
  loadedHourlyCostEur: z.number(),
  model: z.enum([
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "gpt-5-4",
    "gemini-2-5-flash-lite",
    "mistral-small",
  ]),
  inputTokensPerTask: z.number(),
  outputTokensPerTask: z.number(),
  humanReviewRate: z.number(),
  reviewMinutes: z.number(),
  residualErrorRate: z.number(),
  humanErrorRate: z.number(),
  errorCostEur: z.number(),
  setupCostEur: z.number(),
  amortizationMonths: z.number(),
  monthlySubscriptionEur: z.number(),
  region: z.enum(["france", "eu", "usa", "world"]),
  waterScope: z.enum(["on-site", "life-cycle"]),
  assumptions: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

const SYSTEM_PROMPT = `Tu es analyste en automatisation. À partir de la description d'un process métier faite par un dirigeant, tu estimes des paramètres RÉALISTES et plutôt CONSERVATEURS pour évaluer une automatisation par IA.

Tu réponds UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de bloc markdown) qui respecte exactement ce format :
{
  "taskName": string,
  "monthlyVolume": number,                // nombre de tâches par mois
  "humanMinutesPerTask": number,          // minutes qu'un humain met par tâche
  "loadedHourlyCostEur": number,          // coût horaire CHARGÉ en EUR (salaire + charges)
  "model": "claude-opus-4-8" | "claude-sonnet-4-6" | "claude-haiku-4-5" | "gpt-5-4" | "gemini-2-5-flash-lite" | "mistral-small",
  "inputTokensPerTask": number,           // tokens d'entrée typiques
  "outputTokensPerTask": number,          // tokens de sortie typiques
  "humanReviewRate": number,              // fraction 0 à 1 des sorties relues
  "reviewMinutes": number,                // minutes de relecture par sortie vérifiée
  "residualErrorRate": number,            // fraction 0 à 1 d'erreurs IA qui passent
  "humanErrorRate": number,               // fraction 0 à 1 d'erreurs qu'un humain laisse passer sur la même tâche (souvent faible, ~0.01)
  "errorCostEur": number,                 // coût moyen d'une erreur non rattrapée (même coût quelle que soit la source, IA ou humaine)
  "setupCostEur": number,                 // coût de mise en place one-shot
  "amortizationMonths": number,           // durée d'amortissement du setup
  "monthlySubscriptionEur": number,       // abonnement mensuel à l'outil
  "region": "france" | "eu" | "usa" | "world",
  "waterScope": "on-site" | "life-cycle",
  "assumptions": string[],                // 3 à 6 hypothèses courtes en français
  "confidence": "low" | "medium" | "high"
}

Règles :
- Choisis le modèle IA le plus adapté à la complexité réelle : les tâches simples et répétitives vont aux petits modèles (Haiku, Gemini Flash-Lite, Mistral Small).
- humanReviewRate, residualErrorRate et humanErrorRate sont des fractions entre 0 et 1 (0.4 pour 40%), jamais des pourcentages.
- humanErrorRate (taux d'erreur d'un humain sur cette tâche) est en général plus bas que residualErrorRate ; valeur par défaut raisonnable 0.01.
- region par défaut "france", waterScope par défaut "on-site".
- Dans "assumptions", sois transparent : si la description manque d'une info (volume, durée...), fais une hypothèse explicite et signale-la.`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

// Le modèle renvoie parfois 40 au lieu de 0.4. On ramène dans [0,1].
function asFraction(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? Math.min(1, value / 100) : value;
}

export const estimateScenario = createServerFn({ method: "POST" })
  .validator(z.object({ description: z.string().min(3).max(2000) }))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          "Clé API absente. Définis ANTHROPIC_API_KEY dans .env (local) et dans les variables d'environnement Vercel.",
      };
    }

    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: ESTIMATION_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: data.description }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return { ok: false as const, error: "Réponse vide du modèle." };
      }

      const parsed = EstimateSchema.safeParse(JSON.parse(extractJson(textBlock.text)));
      if (!parsed.success) {
        return { ok: false as const, error: "Le modèle a renvoyé un format inattendu, réessaie." };
      }

      // Nettoyage défensif des fractions.
      const scenario = {
        ...parsed.data,
        humanReviewRate: asFraction(parsed.data.humanReviewRate),
        residualErrorRate: asFraction(parsed.data.residualErrorRate),
        humanErrorRate: asFraction(parsed.data.humanErrorRate),
      };

      const u = response.usage;
      const estimationCostEur =
        (u.input_tokens / 1_000_000) * HAIKU_IN_EUR_PER_M +
        (u.output_tokens / 1_000_000) * HAIKU_OUT_EUR_PER_M;

      return {
        ok: true as const,
        scenario,
        assumptions: parsed.data.assumptions,
        confidence: parsed.data.confidence,
        estimationCostEur,
        model: ESTIMATION_MODEL,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return { ok: false as const, error: `Échec de l'estimation : ${message}` };
    }
  });
