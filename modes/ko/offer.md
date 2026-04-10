# 모드: offer -- A-F 전체 평가

후보자가 공고 텍스트나 URL을 주면 항상 6개 블록 A-F를 모두 제공합니다.

## Step 0 -- Archetype 감지

공고를 `_shared.md` 기준 6개 archetype 중 하나로 분류합니다. 하이브리드라면 가장 가까운 2개를 적습니다. 이 분류는 아래에 직접 영향을 줍니다.

- 블록 B에서 어떤 proof point를 우선할지
- 블록 E에서 summary를 어떻게 다시 쓸지
- 블록 F에서 어떤 STAR 이야기를 준비할지

## 블록 A -- 공고 요약

표 형식으로 정리:

- 감지된 archetype
- Domain (platform / agentic / LLMOps / ML / enterprise)
- 역할 성격 (build / consult / manage / deploy)
- 시니어리티
- 근무 형태 (remote / hybrid / onsite)
- 팀 규모 (언급된 경우)
- 1문장 TL;DR

## 블록 B -- 이력서 매치

`cv.md`를 읽고, JD 요구사항 각각을 CV의 정확한 근거와 매핑한 표를 만듭니다.

**Archetype에 맞춘 우선순위:**
- FDE → 빠른 납품, 클라이언트 협업, 현장 대응
- SA → 시스템 설계, 엔터프라이즈 통합, 의사결정
- PM → discovery, 우선순위, 지표
- LLMOps → evals, observability, pipelines
- Agentic → orchestration, HITL, recovery
- Transformation → change management, adoption, enablement

`gaps` 섹션도 포함합니다. 각 gap마다:

1. 하드 블로커인지, nice-to-have인지
2. 인접 경험으로 설명 가능한지
3. 포트폴리오 사례로 보완 가능한지
4. 구체적 보완 전략(커버레터 문장, 빠른 사이드 프로젝트, 인터뷰 framing 등)

## 블록 C -- 레벨과 전략

1. JD가 암시하는 레벨 vs 후보자의 자연스러운 레벨
2. **"과장 없이 시니어하게 포지셔닝"** 전략: 어떤 성과를 강조할지, founder/lead 경험을 어떻게 장점으로 전환할지
3. **Downlevel 대응 전략:** 보상이 공정하면 수용 가능한지, 6개월 재평가 조건, 승급 기준 명확화

## 블록 D -- 보상과 수요

WebSearch로 조사:

- 유사 포지션의 현재 보상 수준
- 해당 회사의 보상 평판
- 시장 수요와 역할 전망

표로 데이터와 출처를 정리합니다. 데이터가 없으면 없다고 명확히 씁니다.

**한국 시장 -- 필수 체크:**
- 제시 금액이 **기본급인지 총보상인지** 구분
- 정규직인지 계약직인지, 수습기간이 있는지
- 포괄임금제 여부와 초과근무 포함 구조
- 퇴직금, 4대보험, 식대/복지포인트 등 현금성 복리후생
- 인센티브, 성과급, 스톡옵션/RSU의 조건

## 블록 E -- 맞춤화 계획

| # | 섹션 | 현재 상태 | 제안 변경 | 이유 |
|---|------|-----------|-----------|------|
| 1 | Summary | ... | ... | ... |

이력서 Top 5 변경점 + LinkedIn Top 5 변경점을 제시해 매치율을 높입니다.

## 블록 F -- 면접 계획

JD 요구사항에 맞춘 STAR+R 이야기 6-10개:

| # | JD 요구사항 | STAR+R 이야기 | S | T | A | R | Reflection |
|---|-------------|---------------|---|---|---|---|------------|

`Reflection`은 무엇을 배웠는지, 다음에는 무엇을 다르게 할지를 담습니다. 시니어함을 보여주는 핵심입니다.

**Story Bank:** `interview-prep/story-bank.md`가 있으면 기존 스토리와 중복되는지 확인하고, 없다면 새 스토리를 추가합니다.

**Archetype별 강조점:**
- FDE → 납품 속도, 고객 임팩트
- SA → 아키텍처 선택과 trade-off
- PM → discovery, metric, prioritization
- LLMOps → 지표, evals, production hardening
- Agentic → orchestration, error handling, HITL
- Transformation → 조직 변화, adoption, enablement

또 함께 포함:

- 추천 case study 1개
- red-flag 질문과 대응법 예: "창업 경험이 왜 지금 이 역할에 맞나요?", "직접 관리한 인원은 몇 명이었나요?"

---

## 평가 후 필수 작업

### 1. report 저장

완성된 평가를 `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`에 저장합니다.

- `{###}` = 다음 순번 3자리
- `{company-slug}` = 회사명 소문자 슬러그
- `{YYYY-MM-DD}` = 오늘 날짜

**report 형식:**

```markdown
# Evaluation: {회사명} -- {직무}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**URL:** {job URL}
**PDF:** {path or pending}

---

## A) 공고 요약
(블록 A 전체)

## B) 이력서 매치
(블록 B 전체)

## C) 레벨과 전략
(블록 C 전체)

## D) 보상과 수요
(블록 D 전체)

## E) 맞춤화 계획
(블록 E 전체)

## F) 면접 계획
(블록 F 전체)

## G) 지원서 초안
(score >= 4.5 일 때만)

---

## Extracted keywords
(ATS 최적화를 위한 JD 키워드 15-20개)
```

### 2. tracker 등록

평가 후 항상 `data/applications.md`에 등록합니다:

- 다음 순번
- 오늘 날짜
- 회사명
- 직무명
- Score
- Status: `Evaluated`
- PDF: `❌` 또는 `✅`
- Report: 상대 링크

**tracker 형식:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
