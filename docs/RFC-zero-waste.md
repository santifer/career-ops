# RFC: Efficient Scoring Engine & Early Fit Gate

## 1. Goal Description
The goal is to introduce a high-efficiency processing gate that reduces token consumption and improves "Match Visibility." Currently, roles that are a 100% mismatch or **Expired** still trigger full evaluations, wasting resources. Furthermore, the current scoring logic allows a low Compensation score to "hide" a perfect role match.

## 2. (a) Token Waste Pattern
**Problem:** The system currently spends significant tokens (WebSearch + A-G reasoning) on roles that a human would reject instantly.
- **Example (Real Cost):** [Report 037](file:///volume1/workspace/career-ops/reports/037-braze-lead-ai-sa-apac-2026-04-09.md) consumed a full reasoning cycle only to conclude the role was **Expired**.
- **Impact:** In a 50-URL batch, evaluating 10 "Expired" or "Non-Tech" roles wastes ~25% of the total session cost.

## 3. (b) Structural Change vs. Pre-filter
**Proposal:** Introducing a **"Dual-Path Scoring Strategy."** 
- **Why not just a pre-filter?** A pre-filter only solves the *waste* problem. A structural change solves the **"Match Compression"** problem.
- **The Difference:** In the current code, a "perfect" role (4.5 fit) with "low" comp (2.0) averages out to a **3.2**. This role gets buried. By structurally separating Comp into a "Post-Match ROI" decision, the 4.5 match is highlighted first, and the user decides if the pay is worth the fit.

## 4. (c) Backwards-Compatibility (Selection Panel)
To respect the original project logic, we add a configuration toggle in `config/profile.yml`. This allows users to choose their preferred philosophy:

```yaml
# config/profile.yml
scoring:
  method: "zero-waste" # Options: "original" or "zero-waste"
  gate_threshold: 4.0  # Roles below this score in the early gate are rejected.
```

- **`original` (Legacy):** Includes Compensation in the 1-5 average. No early rejection gate.
- **`zero-waste` (New):** Removes Compensation from the primary score. Enables the **Early Fit Gate** to kill mismatches before they cost tokens.

## 5. Implementation Status
The code changes for this RFC have been prepared in the branch `rfc/zero-waste-scoring`.
- **`modes/_shared.md`**: Updated to handle conditional scoring.
- **`modes/pipeline.md`**: Updated to use the Early Fit Gate conditionally.
- **`config/profile.example.yml`**: Added configuration examples.
