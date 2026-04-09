# Mode : postuler — Assistant live pour les candidatures (Afrique francophone)

Mode interactif pour le moment ou le candidat remplit un formulaire de candidature. Adapte aux portails africains et aux specificites des RH locales.

## Prerequis

- **Ideal avec Playwright visible** : Le candidat voit le navigateur et Claude peut interagir avec la page.
- **Sans Playwright** : Le candidat partage une capture d'ecran ou colle les questions manuellement.

## Workflow

```
1. DETECTER     -> Lire l'onglet actif (capture/URL/titre)
2. IDENTIFIER   -> Extraire entreprise + role + type de marche
3. RECHERCHER   -> Matcher avec les reports existants dans reports/
4. CHARGER      -> Lire le report complet + Bloc G (si existant)
5. ANALYSER     -> Identifier TOUTES les questions visibles
6. GENERER      -> Pour chaque question, generer une reponse personnalisee
7. PRESENTER    -> Afficher les reponses formatees pour copier-coller
```

## Etape 1 — Detecter l'offre

**Avec Playwright :** Snapshot de la page active.

**Sans Playwright :** Demander au candidat de :
- Partager une capture d'ecran du formulaire
- Ou coller les questions du formulaire en texte
- Ou indiquer entreprise + role pour chercher le contexte

## Etape 2 — Charger le contexte

1. Extraire le nom de l'entreprise et le titre du poste
2. Chercher dans `reports/` par nom d'entreprise (Grep case-insensitive)
3. Si match -> charger le report complet
4. Si Bloc G present -> charger les brouillons de reponses comme base
5. Si PAS de match -> alerter le candidat et proposer un auto-pipeline rapide

## Etape 3 — Generer les reponses

Pour chaque question, construire la reponse selon ce schema :
1. **Contexte du report** : Utiliser les proof points du Bloc B, stories STAR du Bloc F
2. **Ton "Je vous choisis"** : Confiant, pas suppliant
3. **Specificite** : Citer quelque chose de concret de l'offre

**Champs specifiques aux formulaires africains courants :**

- **Pretentions salariales**
  -> Fourchette depuis `profile.yml` dans la devise locale (XOF, MAD, XAF) ET en EUR si remote
  -> Formulation : "Ma pretention est de [fourchette], negociable selon le package global (transport, assurance maladie, etc.)"
  -> NE JAMAIS donner un chiffre unique sans fourchette sur le marche africain

- **Disponibilite**
  -> Date realiste tenant compte du preavis (1-3 mois selon le pays)
  -> Si freelance actuellement : "Disponible sous [X] semaines"

- **Nationalite / Titre de sejour / Permis de travail**
  -> Honnete et concis
  -> Si etranger resident : "[Nationalite], resident [pays] avec titre de sejour valable jusqu'au [date]"
  -> Si diaspora postulant depuis l'etranger : Preciser le statut clairement

- **Mobilite / Deplacement**
  -> Preciser la zone geographique acceptable et la frequence
  -> Si remote : "Teletravail complet depuis [ville], disponible pour des deplacements ponctuels si necessaire"

- **Langues**
  -> Lister : francais (courant/langue maternelle), anglais (niveau), + langues locales si applicable (wolof, dioula, bambara, etc.)
  -> Les langues locales sont un vrai differenciateur — les mentionner toujours

- **Referents / References professionnelles**
  -> Courant sur le marche africain (plus systematique qu'en Europe)
  -> Preparer 2-3 contacts (anciens managers, clients, partenaires)

- **Motivation / Lettre de motivation (champ libre)**
  -> Structure : 1) Pourquoi cette entreprise specifiquement 2) Ce que j'apporte 3) Call to action
  -> Mentionner une realisation concrete liee au secteur de l'entreprise
  -> 150-200 mots maximum pour les formulaires en ligne

- **Mode de paiement (offres remote)**
  -> Si la question est posee : "Wise pour les virements internationaux, ou Deel/Remote.com si l'entreprise le propose"

**Format de sortie :**

```
## Reponses pour [Entreprise] — [Role]

Base : Report #NNN | Score : X.X/5 | Marche : [type]

---

### 1. [Question exacte du formulaire]
> [Reponse prete a copier-coller]

### 2. [Question suivante]
> [Reponse]

...

---

Notes :
- [Points a verifier avant d'envoyer]
- [Suggestions de personnalisation]
```

## Etape 4 — Apres la candidature

Si le candidat confirme que la candidature est envoyee :
1. Mettre a jour le statut dans `applications.md` : `Evaluated` -> `Applied`
2. Mettre a jour le Bloc G du report avec les reponses finales
3. Suggerer l'etape suivante :
   - Pour les postes locaux : Prise de contact LinkedIn avec le recruteur / hiring manager
   - Pour les postes dans les grandes entreprises africaines : Suivi par email formel 5-7 jours apres

## Portails africains — Particularites techniques

| Portail | Comportement | Conseil |
|---------|-------------|---------|
| **AfricaWork** | Formulaire standard, pas de login obligatoire pour certaines offres | Playwright fonctionne bien |
| **Jobafrica** | Souvent redirection vers le site de l'entreprise | Suivre le lien cible |
| **Rekrute (Maroc)** | Compte requis. Formulaire detaille (pretentions, disponibilite, mobilite) | Creer le compte avant de postuler |
| **Emploi.ma** | Similaire a Rekrute | Idem |
| **LinkedIn Africa** | Formulaire standard ou Easy Apply | Playwright peut necessiter un login |
| **Site carriere direct** | Variable selon l'entreprise | Playwright + snapshot |
| **Email direct** | Frequent sur le marche africain (PME, startups) | Generer un email structure avec CV + lettre en PJ |

## Candidature par email (tres courant en Afrique)

Si l'offre demande d'envoyer un email directement (frequence elevee sur le marche africain), generer :

```
Objet : Candidature — [Titre du poste] — [Prenom Nom]

Corps :
[Paragraphe 1 : Accroche et identification du poste]
[Paragraphe 2 : Ce que j'apporte — 2-3 proof points concrets]
[Paragraphe 3 : Pourquoi cette entreprise]
[Call to action : disponibilite pour un entretien]

En PJ : CV.pdf + Lettre de motivation.pdf (si demandee)
```

Garder l'email sous 200 mots. Les recruteurs africains lisent souvent les emails sur mobile.
