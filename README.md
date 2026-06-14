# AIceberg

**Le vrai coût de l'automatisation IA, chiffré et sourcé.**

AIceberg prend un process métier (par exemple « répondre à 500 emails SAV par mois ») et calcule le coût **complet** d'une automatisation par IA face au coût du process humain actuel. Pas seulement le prix des tokens (la pointe de l'iceberg), mais surtout la masse immergée : le temps humain de vérification, le risque d'erreur, les coûts de mise en place, et l'empreinte énergie / eau / carbone.

Il en sort une décision actionnable : **AUTOMATISER**, **HYBRIDE** ou **GARDER HUMAIN**, avec le seuil de bascule (le volume à partir duquel automatiser devient rentable), le modèle optimal, et la comparaison entre trois voies de déploiement : humain, IA cloud, IA locale souveraine.

Projet réalisé pour la **Vibe Coding Arena** (EuraTechnologies, Lille, juin 2026), brief 07 « Le vrai coût de l'IA ».

## La problématique

Les décideurs comparent un prix d'API à un salaire et passent à côté du reste. Résultat : des automatisations qui finissent par coûter plus cher qu'un ingénieur. AIceberg réunit au même endroit les composantes que personne n'additionne, et assume ses fourchettes d'incertitude plutôt que de sortir un faux chiffre précis.

## Ce que fait l'app

- **Langage naturel** : décrivez un process en une phrase, Claude Haiku en déduit un scénario chiffré et affiche ses hypothèses.
- **Verdict chiffré** : économies (ou surcoût) mensuelles, seuil de bascule, et le déclencheur principal expliqué en une phrase.
- **Décomposition du coût par tâche** : tokens API / vérification humaine / risque d'erreur, plus les coûts fixes amortis.
- **Courbe de bascule** : coût humain contre coût IA selon le volume, avec le seuil de croisement.
- **Trois voies de déploiement** : humain, IA cloud (coût par token), IA locale souveraine (infra GPU amortie + électricité, données qui restent chez le client). Le surcoût de la souveraineté est chiffré.
- **Choix du modèle** : classement des modèles par coût mensuel ou par sobriété énergétique (énergie + CO2 par tâche).
- **Empreinte** : énergie, eau et carbone par tâche, avec fourchettes assumées (le périmètre eau change tout).
- **Mode portefeuille** : agrège plusieurs process pour un arbitrage consolidé à l'échelle de l'entreprise.
- **Export du verdict en image** (PNG), et une **landing scrollée** (vidéo d'iceberg scrubbée au scroll, animations GSAP).

## Le coeur défendable : le moteur

Toute la logique de calcul vit dans `src/lib/engine.ts`, en **fonctions pures, typées et inspectables** (aucune boîte noire, aucun appel réseau). Le LLM ne sert qu'à pré-remplir un scénario, il n'intervient pas dans le calcul.

Principales sorties : `evaluate`, `rankModels`, `breakEvenCurve`, `rankBySobriety`, `footprintRange`, `evaluatePortfolio`, `compareDeployments`.

### Le modèle de coût

Pour un process de volume `V` tâches par mois :

- **Coût humain par tâche** = `(minutes humaines / 60) x coût horaire chargé` + `taux d'erreur humain x coût d'incident`
- **Coût IA par tâche** = coût tokens + coût vérification + coût risque
  - tokens = `(tokens_in / 1e6 x prix_in + tokens_out / 1e6 x prix_out)`
  - vérification = `taux_de_vérification x (minutes_de_relecture / 60) x coût_horaire`
  - risque = `taux_d'erreur_résiduel x coût_d'incident`
- **Coût mensuel IA** = `V x coût_IA_variable + coûts_fixes` (abonnement + setup amorti)
- **Seuil de bascule** = `coûts_fixes / (coût_humain_par_tâche - coût_IA_variable_par_tâche)`

Les trois verdicts (GARDER HUMAIN / HYBRIDE / AUTOMATISER) découlent du signe des économies et de seuils de décision transparents (taux de vérification, taux d'erreur, marge nette).

## Stack technique

- **TanStack Start** (React 19 + Vite, SSR) avec server functions
- **Tailwind CSS v4**
- **recharts** (graphes), **lucide-react** (icônes)
- **GSAP** (ScrollTrigger + ScrollSmoother) pour la landing scrollée
- **@anthropic-ai/sdk** + **zod** pour l'estimation en langage naturel (Claude Haiku)
- Déploiement **Vercel** via le preset Nitro

## Démarrer en local

Prérequis : Node 22+.

```bash
npm install
```

Le langage naturel appelle l'API Anthropic, il faut donc une clé. La clé reste **uniquement** côté serveur (server function), elle ne part jamais au navigateur. En dev, passez-la en variable d'environnement au lancement (le `.env` n'est pas toujours injecté dans `process.env` par Vite) :

```bash
export ANTHROPIC_API_KEY=sk-ant-votre-cle
npm run dev
```

L'app démarre sur `http://localhost:8080/`.

> Astuce : les exemples préremplis, la saisie manuelle et tout le moteur fonctionnent **sans clé**. Seul le champ de description en langage naturel a besoin de l'API.

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement (port 8080) |
| `npm run build` | Build de production (sortie `.vercel/output`) |
| `npm run preview` | Prévisualise le build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Déploiement (Vercel)

1. Importer le repo sur vercel.com.
2. Laisser le framework auto-détecté, build command `npm run build` (Nitro génère `.vercel/output`, servi automatiquement).
3. Ajouter la variable d'environnement `ANTHROPIC_API_KEY` (Production + Preview + Development).
4. Déployer. Chaque push redéploie.

## Structure

```
src/
  lib/
    engine.ts                 # le moteur de calcul (source de vérité, fonctions pures)
    api/estimate.functions.ts # server function : langage naturel -> scénario (Claude Haiku)
  routes/
    __root.tsx                # head, shell, meta
    index.tsx                 # landing scrollée + écran de résultats (3 niveaux)
public/
  dive-full.mp4               # vidéo d'iceberg (surface + plongée) scrubbée au scroll
  hero-poster.jpg             # poster / fallback
  logo-aiceberg.png           # logo + favicon
```

## Méthodologie et sources

Le brief demande « du chiffre sourcé, pas de l'effet de démo ». Chaque nombre affiché vient d'une source datée, avec sa fourchette d'incertitude :

- **Tarifs API** : grilles officielles des fournisseurs (Anthropic, OpenAI, Google, Mistral), converties en EUR (1 USD = 0,92 EUR). À revalider le jour J, les prix bougent.
- **Énergie** : calée sur arXiv:2505.09598 « How Hungry is AI? » (mai 2025), classée par familles de modèles.
- **Eau** : facteur WUE. Borne basse on-site ~1,7 mL/Wh ; borne haute cycle de vie ~45 mL/Wh (arXiv:2304.03271). On affiche la fourchette plutôt qu'un faux chiffre précis.
- **Carbone** : intensité du mix électrique par région (France 56, UE 250, USA 369, Monde 480 gCO2eq/kWh, RTE eco2mix / Ember 2024).

## Le message de fond

Le vrai levier de décision n'est presque jamais le prix au token (dérisoire), c'est le **coût humain de vérification** et le **risque d'erreur**. C'est ce qu'AIceberg rend visible.
