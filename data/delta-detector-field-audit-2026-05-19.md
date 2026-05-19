# DELTA — Detector API Field Audit (Task Δ.1)

**Audited at:** 2026-05-19T06:33:52.210Z

Purpose: log the ACTUAL response shape from each detector before writing any code that assumes field names. Hallucination penalty applies if I write code referencing a field that does not appear in this audit.

## Samples

- Human sample (79 words): `I started writing this at 11 pm because my brain finally let go of the
spreadsheet I'd been chewing on all day. Three ro`...
- AI sample (47 words): `In today's rapidly evolving landscape, it is important to leverage data-driven
insights to navigate complex challenges. `...

## GPTZero v2 — `POST https://api.gptzero.me/v2/predict/text`

- Key present: true

### HUMAN sample response
- HTTP status: 200
- top-level keys in `parsed.documents[0]`: `paragraphs, completely_generated_prob, average_generated_prob, predicted_class, confidence_score, confidence_category, overall_burstiness, writing_stats, confidence_thresholds_raw, sentences, class_probabilities, confidence_scores_raw, subclass, pageNumber, neatVersion, version, language, result_message, result_sub_message, document_classification, inputText, document_id`
  - `average_generated_prob`: 1
  - `completely_generated_prob`: 0.9999840881420216
  - `overall_burstiness`: 0
  - `class_probabilities`: object keys=human,ai,mixed
  - `sentences`: array len=11
  - `paragraphs`: array len=7
  - `predicted_class`: "ai"
  - `confidence_category`: "high"
  - `confidence_score`: 1
- first sentence keys: `generated_prob, sentence, perplexity, class_probabilities, interpretability_value, interpretability_normalized_value, interpretability_designation, interpretability_alpha, highlight_sentence_for_ai, special_highlight_type`

### AI sample response
- HTTP status: 200
- top-level keys in `parsed.documents[0]`: `paragraphs, completely_generated_prob, average_generated_prob, predicted_class, confidence_score, confidence_category, overall_burstiness, writing_stats, confidence_thresholds_raw, sentences, class_probabilities, confidence_scores_raw, subclass, pageNumber, neatVersion, version, language, result_message, result_sub_message, document_classification, inputText, document_id`
  - `average_generated_prob`: 1
  - `completely_generated_prob`: 0.9999694654251953
  - `overall_burstiness`: 0
  - `class_probabilities`: object keys=human,ai,mixed
  - `sentences`: array len=7
  - `paragraphs`: array len=5
  - `predicted_class`: "ai"
  - `confidence_category`: "high"
  - `confidence_score`: 1
- first sentence keys: `generated_prob, sentence, perplexity, class_probabilities, interpretability_value, interpretability_normalized_value, interpretability_designation, interpretability_alpha, highlight_sentence_for_ai, special_highlight_type`

## Originality.ai — `POST https://api.originality.ai/api/v1/scan/ai`

- Key present: true

### HUMAN sample response
- HTTP status: 200
- top-level keys: `success, disclaimer, public_link, title, score, blocks, credits_used, credits, subscription, content, aiModelVersion, id`
  - `score` keys: `original, ai` — values: {"original":0.0001,"ai":0.9999}
  - `credits`: 0
  - `credits_used`: 1
  - `content`: "I started writing this at 11 pm because my brain finally let go of the\nspreadsheet I'd been chewing on all day. Three rows in pivot, one merged cell\nthat wasn't supposed to be merged, and the AVERAGEIFS was quietly skipping\nblanks because somebody had typed \"n/a\" into a column expecting numbers. I\nkilled the merge, swapped the n/a's for empty cells, and the pivot finally\nagreed with the source-of-truth dashboard. Tiny win. Still annoyed about the\ntwo hours."

### AI sample response
- HTTP status: 200
- top-level keys: `success, disclaimer, public_link, title, score, blocks, credits_used, credits, subscription, content, aiModelVersion, id`
  - `score` keys: `original, ai` — values: {"original":0,"ai":1}
  - `credits`: 0
  - `credits_used`: 1
  - `content`: "In today's rapidly evolving landscape, it is important to leverage data-driven\ninsights to navigate complex challenges. Furthermore, organizations must\nstreamline operations and foster a culture of continuous improvement. By\nharnessing the power of artificial intelligence, stakeholders can unlock new\nopportunities and drive transformative growth across the enterprise."

## Fields DELTA code is allowed to reference downstream

Only fields confirmed present in the responses above are quotable by name in `lib/ai-detection-gate.mjs` or any subsequent DELTA artifact. Anything not in this log: investigate before asserting.
