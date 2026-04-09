# Mode : contacto — Prise de contact (Afrique francophone)

Mode pour generer des messages de prise de contact LinkedIn, WhatsApp pro ou email vers des recruteurs et hiring managers. Adapte aux codes du networking africain.

## Contexte — Networking africain

Le networking en Afrique francophone a ses propres codes :
- **LinkedIn est dominant dans les grandes villes** (Dakar, Abidjan, Casablanca, Douala) mais moins penetrant que dans les pays anglophones
- **WhatsApp pro est tres utilise** pour les prises de contact informelles, surtout dans les PME et startups locales
- **Les recommandations ("pistons")** jouent un role important — valoriser les connexions communes
- **La communaute tech est petite** — les recruteurs africains recoivent moins de messages que leurs homologues europeens -> meilleur taux de reponse potentiel
- **Le ton doit rester respectueux** mais direct. Eviter le trop-formel (vouvoyement excessif) comme le trop-familier.

## Workflow

```
1. IDENTIFIER   -> Entreprise + role cible + nom du recruteur/hiring manager
2. RECHERCHER   -> Profil LinkedIn / infos disponibles sur la personne
3. CONTEXTE     -> Lire le report de l'offre si existant
4. GENERER      -> Message personnalise selon le canal (LinkedIn / WhatsApp / Email)
5. PRESENTER    -> Afficher le message pret a envoyer
```

## Etape 1 — Trouver le bon contact

Utiliser WebSearch pour trouver :
1. Le recruteur ou hiring manager de l'entreprise ciblee
2. Son profil LinkedIn
3. Des connexions communes eventuelles (verifier dans le profil du candidat)

Recherches suggerees :
- `"[Entreprise]" recruteur LinkedIn site:linkedin.com`
- `"[Entreprise]" RH OR "talent acquisition" site:linkedin.com`
- `"[Entreprise]" CTO OR "engineering manager" site:linkedin.com`

## Etape 2 — Generer le message LinkedIn

**Format LinkedIn (300 caracteres max pour les non-connexions) :**

```
Bonjour [Prenom],

J'ai vu l'offre [Titre du poste] chez [Entreprise] — elle correspond exactement a mon profil [Full-Stack / Backend / AI Developer].

[1 phrase de proof point concret lie a l'offre]

Je postule formellement. Seriez-vous disponible pour un echange ?

[Prenom du candidat]
```

**Format LinkedIn — Message de connexion (note) :**

```
Bonjour [Prenom], je postule au poste de [titre] chez [entreprise]. Mon profil : [1 ligne]. Ravi d'echanger.
```

## Etape 3 — Generer le message WhatsApp pro (si applicable)

Utiliser WhatsApp uniquement si :
- L'offre mentionne un contact WhatsApp
- La personne a partage son numero dans un contexte pro (groupe LinkedIn, evenement)
- C'est une startup ou PME africaine ou le WhatsApp pro est courant

**Format WhatsApp :**

```
Bonjour [Prenom], je suis [Prenom Candidat], [titre court].

J'ai vu votre offre pour [role] chez [entreprise]. Mon profil correspond : [1-2 lignes concretes].

Je vous ai envoye ma candidature via [portail/email]. Est-ce que vous seriez disponible pour un bref echange ?
```

## Etape 4 — Generer l'email de suivi (7 jours apres candidature)

```
Objet : Relance — Candidature [Titre du poste] — [Prenom Nom]

Bonjour [Prenom / M. Mme si formel],

Je me permets de faire suite a ma candidature pour le poste de [titre], envoyee le [date].

[1 phrase sur ce qui me motive specifiquement dans cette entreprise / ce projet]
[1 proof point concret lie au besoin de l'offre]

Je reste disponible pour un entretien selon vos disponibilites.

Cordialement,
[Prenom Nom]
[Telephone] | [LinkedIn] | [Portfolio si pertinent]
```

## Cas specifiques africains

### Candidature spontanee (tres efficace sur le marche africain)

La candidature spontanee est bien acceptee en Afrique, surtout dans les startups tech.

**Format email candidature spontanee :**

```
Objet : Candidature spontanee — [Profil] — [Prenom Nom]

Bonjour,

Je suis [Prenom], [titre], base a [ville].

[Ce qui m'attire dans l'entreprise — specifique, pas generique]
[2-3 proof points concrets alignes sur la mission de l'entreprise]
[Disponibilite et mode de travail : presentiel, remote, hybride]

Mon profil : [lien LinkedIn ou portfolio]
CV en piece jointe.

Je serais ravi d'echanger sur les opportunites disponibles ou a venir.

Cordialement,
[Prenom Nom]
```

### Connexion via reseau (recommandation)

Si une connexion commune existe, la mentionner en premiere ligne :

```
Bonjour [Prenom],

[Nom de la connexion] m'a recommande de vous contacter — il/elle pense que mon profil [titre] pourrait correspondre a vos besoins.

[1-2 lignes sur le profil et la valeur ajoutee]

Seriez-vous disponible pour un bref echange ?
```

### Evenements tech africains (post-evenement)

Apres un evenement tech (GITEX Africa, AfricaCom, Dakar Digital Week, etc.) :

```
Bonjour [Prenom],

Nous nous sommes croises a [evenement] la semaine derniere. [Reference concrete a l'echange si possible]

Je suis [Prenom], [titre]. [1 ligne sur ce que je construis / mon profil]

Je serais ravi de continuer l'echange — avez-vous 20 minutes cette semaine ?
```

## Suivi et tracker

Apres envoi d'un message de contact :
- Ajouter une note dans `data/applications.md` (colonne Notes) : "Contact LinkedIn envoye le [date] a [Prenom Nom]"
- Relancer si pas de reponse sous 7-10 jours (une seule relance)
- Ne jamais envoyer plus de 2 messages sans reponse
