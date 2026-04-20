# Attribution

Fork francophone de [santifer/career-ops](https://github.com/santifer/career-ops) sous licence MIT.

**Auteur original :** Santiago Fernández de Valderrama ([@santifer](https://github.com/santifer))
Merci pour l'architecture initiale et la mécanique brillante du pipeline.

**Adaptation française, archétypes FR, intégration API France Travail :**
Copyright (c) 2026 Bertrand Bonnet.

## Ce qui a changé dans le fork

- Traduction complète en français (README, CLAUDE.md, docs, modes)
- 6 archétypes adaptés au marché français (dev fullstack PME, commercial B2B, manager, artisan, support, alternance)
- Intégration native de l'API France Travail (OAuth2, gratuit)
- Adapters Playwright pour APEC, Welcome to the Jungle, HelloWork, Jobijoba, RégionsJob
- Mode « lettre de motivation » créé from scratch
- Template CV adapté aux normes françaises (Europass-compatible)
- LinkedIn/Indeed/Glassdoor : mode paste-only pour respecter leurs CGU

## Ce qui n'a pas changé

Les 12 invariants de la mécanique career-ops sont intacts :
1. Input polymorphe auto-détecté
2. Verrou d'onboarding
3. Scoring multi-dimensions pondéré
4. Classification par archétypes
5. Fichiers plats versionnables
6. Modes = fichiers markdown atomiques
7. Auto-personnalisable par l'IA
8. Batch parallèle avec merge d'intégrité
9. Dashboard TUI
10. Health checks dédiés
11. Humain dans la boucle
12. Filtre > reach
