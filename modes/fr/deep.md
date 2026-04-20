<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Mode : deep — Recherche approfondie sur l'entreprise

Génère un prompt structuré pour Perplexity/Claude/ChatGPT avec 6 axes :

```
## Deep Research : [Entreprise] — [Rôle]

Contexte : J'évalue une candidature pour [rôle] chez [entreprise]. J'ai besoin d'informations actionnables pour l'entretien.

### 1. Stratégie IA
- Quels produits/features utilisent l'IA/ML ?
- Quel est leur stack IA ? (modèles, infra, outils)
- Ont-ils un blog engineering ? Que publient-ils ?
- Quels papers ou talks ont-ils donnés sur l'IA ?

### 2. Mouvements récents (6 derniers mois)
- Recrutements pertinents en IA/ML/product ?
- Acquisitions ou partenariats ?
- Lancements de produit ou pivots ?
- Levées de fonds ou changements de leadership ?

### 3. Culture engineering
- Comment shippent-ils ? (cadence de deploy, CI/CD)
- Mono-repo ou multi-repo ?
- Quels langages/frameworks utilisent-ils ?
- Remote-first ou office-first ?
- Reviews Glassdoor/Blind sur la culture engineering ?

### 4. Défis probables
- Quels problèmes de scaling rencontrent-ils ?
- Défis de reliability, coût, latence ?
- Sont-ils en migration ? (infra, modèles, plateformes)
- Quels pain points la communauté mentionne-t-elle dans les reviews ?

### 5. Concurrents et différenciation
- Qui sont leurs principaux concurrents ?
- Quel est leur moat/différenciateur ?
- Comment se positionnent-ils face à la concurrence ?

### 6. Angle du candidat
Étant donné mon profil (lire cv.md et profile.yml pour l'expérience spécifique) :
- Quelle valeur unique j'apporte à cette équipe ?
- Quels projets sont les plus pertinents ?
- Quelle histoire devrais-je raconter en entretien ?
```

Personnaliser chaque section avec le contexte spécifique de l'offre évaluée.
