# Mode : offre — Evaluation complete A-F (Afrique francophone)

Quand le candidat colle une offre (texte ou URL), TOUJOURS livrer les 6 blocs.

## Etape 0 — Detection d'archetype et de marche

Classer l'offre dans l'un des archetypes (voir `_shared.md`). Identifier aussi le type de marche :

| Type de marche | Signaux | Impact sur l'evaluation |
|----------------|---------|-------------------------|
| **Startup africaine locale** | Fintech, healthtech, edtech ; fondateurs locaux | Valoriser polyvalence, livraison rapide, frugalite |
| **Multinationale / filiale** | Orange, MTN, Total, Societe Generale, Ecobank | Valoriser processus, standards internationaux, certifications |
| **Remote international** | Salaire EUR/USD, equipe distribuee, paiement via Wise/Deel | Valoriser autonomie, async, overlap horaire, qualite code |
| **ONG / institution** | PNUD, UNICEF, Banque Mondiale, USAid, AFD | Valoriser impact social, multilinguisme, experience terrain |
| **Hub / incubateur** | Jokkolabs, CTIC Dakar, Epitech Africa | Valoriser communaute, mentoring, open-source |

## Bloc A — Resume du role

Tableau avec :
- Archetype detecte
- Type de marche (voir tableau ci-dessus)
- Devise de remuneration et mode de paiement prevu
- Remote / Hybride / Sur site + ville
- Taille d'equipe (si mentionnee)
- TL;DR en 1 phrase
- **Flag immediat :** L'offre precise-t-elle le mode de paiement (si remote) ? CDI ou CDD ?

## Bloc B — Match avec le CV

Lire `cv.md`. Creer un tableau ou chaque prerequis de l'offre est mappe sur des lignes exactes du CV.

Section **Lacunes (Gaps)** avec strategie de mitigation pour chacune :
1. Est-ce un bloqueur dur ou un nice-to-have ?
2. Le candidat peut-il demontrer une experience adjacente ?
3. Y a-t-il un projet portfolio qui couvre cette lacune ?
4. Plan de mitigation concret

**Framing "Builder sur terrain difficile" :**
Si l'offre valorise la resilience, l'adaptation ou l'innovation dans les marches emergents, expliciter comment le contexte africain du candidat est un avantage direct (pas une excuse, une preuve).

## Bloc C — Niveau et strategie

1. **Niveau detecte** dans l'offre vs niveau naturel du candidat
2. **Plan "vendre senior sans mentir"** : formulations specifiques, realisations a mettre en avant
3. **Plan "si je suis downlevel"** : accepter si la remuneration est juste, negocier une revue a 6 mois
4. **Signal fondateur / builder** : Si le candidat a lance un projet/produit, c'est LE differenciateur #1 sur le marche africain — les recruteurs africains valorisent enormement l'initiative entrepreneuriale

## Bloc D — Remuneration et demande

Utiliser WebSearch pour :
- Salaires actuels du role sur le marche local (AfricaWork, Glassdoor, LinkedIn Salary, enquetes sectorielles)
- Reputation de remuneration de l'entreprise
- Comparaison avec les standards remote internationaux si applicable

Tableau avec donnees et sources citees. Si pas de donnees disponibles, le dire clairement.

**Verifications obligatoires — Marche africain :**
- CDI ou CDD ? Duree si CDD ?
- CNSS / cotisations sociales incluses ? Employeur declare ?
- Mode de paiement si remote : Wise ? Deel/Remote.com ? Virement SWIFT direct ? Freelance/facture ?
- Avantages en nature : transport, logement, assurance maladie (IPM), per diem, billet annuel ?
- Devise : XOF / MAD / XAF / USD / EUR ? Taux de change applique si mixte ?
- 13e mois ou bonus mentionnes ? Contractuels ou discretionnaires ?
- Frais de scolarite enfants (postes expatries/ONG) ?

**Calcul de remuneration nette effective :**
Pour les offres africaines, toujours calculer :
1. Salaire brut -> deductions CNSS/IPRES/impot -> salaire net
2. Valeur monetaire des avantages en nature (transport = ~X XOF/mois, logement = ~Y XOF/mois...)
3. Package effectif total en XOF/MAD/EUR pour comparaison

## Bloc E — Plan de personnalisation

| # | Section | Etat actuel | Changement propose | Justification |
|---|---------|-------------|--------------------|----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 modifications du CV + Top 5 modifications LinkedIn pour maximiser le match.

**Pour les offres remote :** Ajouter systematiquement dans le summary :
- Overlap horaire disponible (ex : "Disponible 9h-18h GMT, overlap de 5h avec Paris")
- Environnement de travail async (ex : "Experimente en travail asynchrone et en equipes distribuees")
- Outils de collaboration (Notion, Linear, Slack, GitHub)

## Bloc F — Plan d'entretiens

6-10 stories STAR+R mappees sur les prerequis de l'offre :

| # | Prerequis de l'offre | Story STAR+R | S | T | A | R | Reflection |
|---|---------------------|--------------|---|---|---|---|------------|

**Questions frequentes specifiques au marche africain :**
- "Vous etes base a [ville africaine] — comment gerez-vous le travail en remote avec une equipe en Europe ?"
  -> Reponse type : Preparer avec des chiffres concrets (overlap horaire, outils, references projets)
- "Votre experience est principalement locale — comment vous positionnez-vous pour un poste international ?"
  -> Reponse type : Valoriser le "Builder sur terrain difficile" + exemples de collaboration internationale
- "Quelle est votre politique sur les coupures de courant / internet ?"
  -> Reponse type : Honnete et prepare (groupe electrogene, 4G backup, communication proactive)
- "Pourquoi ne pas postuler directement en France / Europe ?" (postes diaspora)
  -> Reponse type : Valeur ajoutee specifique — marche africain, multilinguisme, vision Sud-Sud

---

## Post-evaluation

**TOUJOURS** executer apres les blocs A-F :

### 1. Sauvegarder le report .md

Sauvegarder dans `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

**Format du report :**

```markdown
# Evaluation : {Entreprise} — {Role}

**Date :** {YYYY-MM-DD}
**Archetype :** {detecte}
**Marche :** {type de marche}
**Score :** {X/5}
**URL :** {URL de l'offre}
**PDF :** {chemin ou en attente}

---

## A) Resume du role
## B) Match avec le CV
## C) Niveau et strategie
## D) Remuneration et demande
## E) Plan de personnalisation
## F) Plan d'entretiens
## G) Brouillons de reponses (si score >= 4.5)

---

## Mots-cles extraits
(15-20 mots-cles de l'offre pour l'optimisation ATS)
```

### 2. Enregistrer dans le tracker

**TOUJOURS** enregistrer dans `data/applications.md` apres chaque evaluation.
