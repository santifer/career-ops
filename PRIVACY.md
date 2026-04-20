# Politique de confidentialité — career-ops-fr

## Principe fondamental

**Aucune donnée ne quitte ta machine sans ton action explicite.**

career-ops-fr est un outil local qui tourne exclusivement sur ton ordinateur. Il n'y a pas de serveur, pas de base de données distante, pas de tracking, pas de cookies, pas de compte utilisateur.

## Ce qui reste sur ta machine

- Ton CV (`cv.md`)
- Ton profil (`config/profile.yml`)
- Tes rapports d'évaluation (`reports/`)
- Ton tableau de suivi (`data/applications.md`)
- Tes PDFs générés (`output/`)
- Le cache des offres consultées (`cache/`)

**Tout est stocké en fichiers plats dans le répertoire du projet.** Tu peux inspecter, modifier ou supprimer n'importe quel fichier à tout moment. Un `rm -rf career-ops-fr` efface tout.

## Ce qui sort de ta machine (uniquement sur ton action)

| Destination | Quand | Quelles données |
|-------------|-------|-----------------|
| **API France Travail** | Quand tu lances une recherche d'offres | Mots-clés de recherche, code département — jamais ton CV ni tes données personnelles |
| **Fournisseur d'IA** (Anthropic, Google, Ollama local) | Quand tu évalues une offre | Le texte de l'offre + ton CV sont envoyés au LLM pour l'évaluation. Avec Ollama, tout reste local |
| **Portails emploi** (APEC, WTTJ, etc.) | Quand tu scannes un portail | Requête HTTP simple (comme si tu visitais le site dans ton navigateur) |
| **GitHub** | Si tu push ton fork | Ce que tu décides de committer — ne commite jamais `.env` ni `data/` |

## Ce que career-ops-fr ne fait JAMAIS

- Collecter des données à des fins de marketing ou de profilage
- Envoyer des données à des tiers sans ton action explicite
- Créer un compte utilisateur ou stocker un identifiant
- Tracker ton utilisation du logiciel
- Candidater à des offres en ton nom (invariant n°11 : humain dans la boucle)

## Conformité RGPD

career-ops-fr est conforme au RGPD par conception (*privacy by design*) :
- **Minimisation des données** : seules les données nécessaires à l'évaluation sont traitées
- **Pas de collecte** : aucune donnée n'est collectée par l'éditeur du logiciel
- **Contrôle total** : tu peux supprimer toutes tes données en supprimant le répertoire du projet
- **Portabilité** : toutes tes données sont en formats ouverts (Markdown, YAML, TSV, HTML)

## Pour aller plus loin

Si tu utilises Ollama comme backend LLM, l'intégralité du traitement reste locale — y compris les évaluations d'offres. Aucune donnée ne sort de ta machine dans ce cas.
