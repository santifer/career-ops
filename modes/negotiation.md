# Mode: negotiation — Offer Negotiation

Structured mode for when the user receives an actual job offer. Completely separate from `oferta` (which evaluates job postings).

**This mode is standalone.** It reads existing data (reports, tracker, profile.yml) but creates its own output. No changes to existing pipeline behavior.

## When to Trigger

- User says "I got an offer from [company]"
- User updates a tracker entry to Offer
- User runs `/career-ops negotiation`

## Step 1 — Capture the Offer

Ask the user for the offer details (or read from a document/screenshot):

| Field | Example | Notes |
|-------|---------|-------|
| Base salary | $180,000 | Annual |
| Equity/RSUs | $50,000/yr (4yr vest) | Total grant ÷ vesting period |
| Signing bonus | $20,000 | One-time |
| Annual bonus | 15% target | As % of base |
| Benefits | Standard | Healthcare, 401k match, etc. |
| PTO | Unlimited / 20 days | |
| Remote policy | Full remote | |
| Start date | YYYY-MM-DD | |
| Deadline to respond | YYYY-MM-DD | Critical — drives urgency |
| Level/title | Senior Engineer | |
| Other perks | $5K learning budget | Anything else |

## Step 2 — Total Comp Calculation

Compute total annual comp:

```
Base:           $180,000
Equity (annual): $50,000   (total grant ÷ vesting years)
Bonus (target):  $27,000   (base × bonus %)
Signing (annual): $10,000   (signing ÷ 2, amortized over first 2 years)
───────────────────────────
Total Year 1:   $267,000
Total Ongoing:  $257,000   (without signing bonus amortization)
```

**For equity at private companies:**
- Apply a discount: pre-IPO equity is illiquid. Common: 50-70% discount for early stage, 20-30% for late stage.
- Note the strike price if options (not RSUs). Compute current spread if possible.
- Flag if there's no secondary market.

## Step 3 — Compare Against Target & Pipeline

Read from `config/profile.yml`:
- `compensation.target_range` — is the offer within, above, or below?
- `compensation.minimum` — is it above the walk-away number?

Read from `data/applications.md`:
- How many other offers are at Interview or Offer stage? (This is your leverage.)
- What scores did those have? (Higher-scored alternatives = stronger negotiating position.)

```
## Leverage Assessment

Active pipeline:
- Offer: [this one] + N others
- Interview stage: N companies
- Applied (awaiting): N companies

Leverage: [Strong/Moderate/Weak]
- Strong: 2+ competing offers or 3+ active interviews
- Moderate: 1 other offer or 2+ interviews
- Weak: this is the only active opportunity
```

## Step 4 — Counter-Offer Strategy

Based on leverage and gap to target:

**If offer is below target range:**
```
Recommended counter: [target midpoint + 10%]
Justification: "Based on market data for [role] at [level], 
and given [competing offers / pipeline activity], I'm targeting [range]."
```

**If offer is within target range:**
```
Recommended counter: [target top end]
Justification: "I'm excited about this role. To make the decision 
straightforward, [specific ask — e.g., bump equity, signing bonus, level]."
```

**If offer is above target range:**
```
Focus negotiation on non-comp factors: level/title, scope, 
team choice, start date flexibility, remote policy.
```

### Negotiation Scripts (adapted from _shared.md)

Generate 3 scripts ready for use:

1. **Initial response** (buy time): "Thank you for the offer. I'm very interested and want to give this proper consideration. Can I have until [deadline or +3 days] to review the full package?"

2. **Counter-offer** (if needed): Specific to the gap. Reference market data from Block D if available. Never give a single number — always a range.

3. **Acceptance** (when ready): Confirm all terms in writing. Ask for the offer letter with the agreed terms before giving verbal acceptance.

### What NOT to Do
- Never counter before understanding the full package
- Never reveal your current comp or other offer amounts
- Never give an ultimatum unless you're prepared to walk
- Never negotiate via email if you can do it via call (nuance matters)

## Step 5 — Decision Framework

If the user has multiple offers, build a decision matrix using the same scoring dimensions from `_shared.md`:

```
| Dimension | Offer A | Offer B |
|-----------|---------|---------|
| Total comp (Year 1) | $267K | $245K |
| Equity upside | Moderate (Series C) | High (Series A) |
| Role match (from eval) | 4.5/5 | 3.8/5 |
| Growth trajectory | Clear path to Staff | Flat org |
| Remote quality | Full remote | Hybrid 2x/week |
| Gut feeling | High | Medium |
```

Include a "gut feeling" row — quantitative analysis doesn't capture everything.

## Step 6 — Save & Update Tracker

1. Update `data/applications.md`: status → `Offer`, notes → comp summary
2. Append `## Offer Details` section to the existing report with full comp breakdown and negotiation outcome
3. If the user accepts: status → a new note like `Accepted YYYY-MM-DD`

## Deadline Management

If the user has a response deadline:
- Calculate business days remaining
- If < 3 business days and other interviews are active, suggest: "Ask [company] for an extension — 'I want to make a thoughtful decision and have a final interview scheduled this week. Could we extend to [date]?'"
- If the deadline is firm and leverage is weak, help the user decide with what they have
