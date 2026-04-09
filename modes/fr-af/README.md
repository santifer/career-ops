# career-ops — Modes Afrique francophone (`modes/fr-af/`)

Ce dossier contient les modes career-ops adaptes au marche de l'emploi de l'Afrique francophone : Senegal, Cote d'Ivoire, Cameroun, RDC, Maroc, Tunisie, Madagascar, et toute la diaspora africaine cherchant des postes remote depuis l'Europe ou l'Amerique du Nord.

## Quand utiliser ces modes ?

Utilise `modes/fr-af/` si au moins une de ces conditions est remplie :

- Tu es base dans un pays d'Afrique francophone (Dakar, Abidjan, Douala, Kinshasa, Casablanca, Tunis, Antananarivo...)
- Tu postules a des entreprises africaines (startups tech locales, filiales de groupes internationaux, ONG/institutions)
- Tu cibles des postes **remote international** depuis l'Afrique (paiement en EUR/USD via Wise, Wave, Deel, Remote.com)
- Tu dois negocier en XOF, MAD, XAF ou USD tout en comparant avec des standards EUR/USD internationaux
- Tu cherches a entrer dans la diaspora africaine tech en Europe en valorisant une experience locale

Si tu postules principalement a des offres en France/Belgique/Suisse sans lien avec l'Afrique, utilise plutot `modes/fr/`.

## Comment activer ?

### Option 1 — Par session

Dis a Claude en debut de session :

> "Utilise les modes Afrique francophone sous `modes/fr-af/`."

### Option 2 — En permanence

Ajoute dans `config/profile.yml` :

```yaml
language:
  primary: fr
  modes_dir: modes/fr-af
```

## Quels modes sont inclus ?

| Fichier | Role |
|---------|------|
| `_shared.md` | Contexte partage — marches, devises, droit du travail OHADA, specificites remote Afrique |
| `offre.md` | Evaluation complete d'une offre (Blocs A-F) — adapte aux portails africains et aux packages locaux |
| `postuler.md` | Assistant live pour remplir les formulaires — inclut les champs specifiques aux RH africaines |
| `pipeline.md` | Inbox d'URLs — portails africains reconnus (AfricaWork, Jobafrica, Rekrute, etc.) |
| `contacto.md` | Prise de contact LinkedIn/WhatsApp — adapte au networking africain |

## Ce qui differe de `modes/fr/` (France)

| Dimension | `modes/fr/` (France) | `modes/fr-af/` (Afrique) |
|-----------|---------------------|--------------------------|
| Droit du travail | Code du travail francais, SYNTEC | OHADA + codes locaux (CODT Senegal, Code du Travail CI...) |
| Devises | EUR | XOF, MAD, XAF, CDF, USD, EUR (remote) |
| Avantages | RTT, mutuelle, CSE, titres-restaurant | Transport, logement, assurance maladie, per diem, frais de scolarite |
| Portails principaux | WTTJ, Indeed FR, APEC, France Travail | AfricaWork, Jobafrica, Rekrute, LinkedIn Africa, NITA (CI), TechAfrica |
| Remote payment | Virement SEPA | Wave, Orange Money, Wise, Deel, Remote.com, Western Union |
| Networking | LinkedIn, WTTJ | LinkedIn, WhatsApp pro, evenements tech locaux (GITEX Africa, Africacom, etc.) |

## Lexique de reference

Pour garder un ton coherent si tu modifies ou etends les modes :

| Anglais | Francais (dans cette codebase) |
|---------|-------------------------------|
| Permanent employment | CDI (ou equivalent local) |
| Fixed-term contract | CDD (ou CDD de chantier selon le pays) |
| Probation | Periode d'essai |
| Notice period | Preavis |
| Gross salary | Salaire brut |
| Net salary | Salaire net |
| Benefits | Avantages en nature / Package |
| Transport allowance | Indemnite de transport |
| Housing allowance | Indemnite de logement |
| Per diem | Per diem / Indemnite journaliere |
| Social security | CNSS (Caisse Nationale de Securite Sociale) |
| Health insurance | Assurance maladie / IPM (Institution de Prevoyance Maladie) |
| Annual leave | Conges payes |
| Remote work | Teletravail / Remote |
| Freelance | Freelance / Consultant independant |
| Invoice | Facture |
| Tech hub | Hub tech / Incubateur |
| ONG/NGO | ONG (Organisation Non Gouvernementale) |
| Microfinance | Microfinance / IMF |
| Mobile money | Mobile money (Wave, Orange Money, MTN Mobile Money) |

## Contribuer

Pour ameliorer une traduction ou ajouter un mode :

1. Ouvre une Issue avec ta proposition (voir `CONTRIBUTING.md`)
2. Respecte le lexique ci-dessus pour garder le ton coherent
3. Les specificites varient selon les pays : Maroc ≠ Senegal ≠ Cameroun. Indique toujours le(s) pays concerne(s) quand la regle est specifique a un pays
4. Teste avec une vraie offre du marche africain avant de soumettre la PR
