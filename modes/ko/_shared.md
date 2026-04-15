# 공통 컨텍스트 -- career-ops (한국어)

<!-- ============================================================
     이 파일은 시스템 레이어에 속합니다. 개인 데이터는 넣지 마세요.
     개인화는 modes/_profile.md 또는 config/profile.yml 에 저장합니다.
     ============================================================ -->

## 단일 진실 공급원

| 파일 | 경로 | 언제 읽나 |
|------|------|-----------|
| CV (resumes/) | `resumes/` 폴더에서 가장 적합한 파일 (예: `resumes/ai-engineer-cv.md`). 역할 유형이 불분명하면 폴더 목록 확인 후 선택. | 항상 |
| article-digest.md | `article-digest.md` | 있으면 항상 |
| profile.yml | `config/profile.yml` | 항상 |
| _profile.md | `modes/_profile.md` | 항상 |

**규칙: proof point의 수치와 성과는 절대 지어내지 말 것.** 평가 시 선택한 `resumes/` CV 파일과 `article-digest.md`에서 직접 읽습니다.
**규칙: article/project 관련 수치는 `article-digest.md`가 CV 파일보다 우선합니다.**
**규칙: 이 파일 다음에 `_profile.md`를 읽습니다. 사용자 커스터마이징이 기본값보다 우선합니다.**

---

## 점수 체계

평가는 A-F 6개 블록으로 진행하며, 전체 점수는 1-5점입니다.

| 항목 | 의미 |
|------|------|
| CV match | 기술, 경력, proof point 일치도 |
| North Star alignment | 사용자의 목표 archetype과의 적합도 |
| Comp | 시장 대비 보상 수준 |
| Cultural signals | 조직 문화, 성장성, 안정성, 근무 방식 |
| Red flags | 위험 신호, 제약, 감점 요소 |
| **Global** | 가중 평균 |

**점수 해석:**
- 4.5+ → 매우 강한 매치, 바로 지원 권장
- 4.0-4.4 → 좋은 매치, 지원할 가치가 큼
- 3.5-3.9 → 나쁘지 않지만 최적은 아님, 이유가 있을 때만 지원
- 3.5 미만 → 지원 비추천

## Archetype 분류

모든 공고를 아래 유형 중 하나 또는 두 개의 하이브리드로 분류합니다.

| Archetype | JD 신호 |
|-----------|---------|
| AI Platform / LLMOps | `observability`, `evals`, `pipelines`, `monitoring`, `reliability` |
| Agentic / Automation | `agent`, `HITL`, `orchestration`, `workflow`, `multi-agent` |
| Technical AI PM | `PRD`, `roadmap`, `discovery`, `stakeholder`, `product manager` |
| AI Solutions Architect | `architecture`, `enterprise`, `integration`, `design`, `systems` |
| AI Forward Deployed | `client-facing`, `deploy`, `prototype`, `fast delivery`, `field` |
| AI Transformation | `change management`, `adoption`, `enablement`, `transformation` |

Archetype를 정한 뒤에는 반드시 `modes/_profile.md`를 읽고, 해당 archetype에 맞는 사용자 proof point와 포지셔닝을 적용합니다.

## 전역 규칙

### 절대 하지 말 것

1. 경력, 직함, 수치, 결과를 꾸며내지 말 것
2. `resumes/` 폴더의 CV 파일이나 포트폴리오 원본을 임의 수정하지 말 것
3. 사용자를 대신해 지원을 제출하지 말 것
4. 생성 메시지에 전화번호를 임의로 넣지 말 것
5. 시장보다 낮은 보상을 쉽게 수용하라고 권하지 말 것
6. JD를 읽기 전에 PDF를 만들지 말 것
7. 뻔한 corporate-speak를 쓰지 말 것
8. tracker 기록을 빼먹지 말 것

### 항상 할 것

0. **커버레터:** 지원서에서 허용되면 항상 포함합니다. CV와 같은 디자인, JD 문구와 proof point를 연결, 1페이지 이내.
1. 평가 전에 `resumes/`에서 가장 적합한 CV 파일, `_profile.md`, `article-digest.md`(있다면)를 읽습니다.
1b. **세션 첫 평가 시** `node cv-sync-check.mjs`를 실행하고 경고가 있으면 사용자에게 알립니다.
2. 역할 archetype를 감지하고 `_profile.md`에 맞게 포지셔닝합니다.
3. 매칭 시 CV의 정확한 근거를 인용합니다.
4. 보상과 회사 정보는 WebSearch로 조사합니다.
5. 평가 후 tracker에 반드시 등록합니다.
6. 결과물은 JD 언어에 맞춰 생성합니다. 기본은 영어, 한국어 JD면 자연스러운 한국어를 사용합니다.
7. 직접적이고 실행 가능한 표현을 사용합니다. 군더더기는 줄입니다.
8. 후보자-facing 문서는 자연스러운 테크 문체로 씁니다. 짧은 문장, 능동형, 과장 금지.
8b. PDF Professional Summary에는 가능하면 case study URL을 넣습니다.
9. **Tracker 추가는 TSV로만** 처리합니다. `applications.md`를 직접 편집하지 않습니다.
10. **모든 report 헤더에 `**URL:**`을 포함합니다.**

### 도구

| 도구 | 사용 목적 |
|------|-----------|
| WebSearch | 보상 조사, 시장 동향, 회사 문화, LinkedIn 연락처, JD fallback |
| WebFetch | 정적 페이지 JD 추출 fallback |
| Playwright | 공고 활성 여부 확인, SPA JD 추출. **Playwright는 절대 2개 이상 병렬 실행 금지.** |
| Read | `resumes/` CV 파일, `_profile.md`, `article-digest.md`, 템플릿 읽기 |
| Write | 임시 HTML, report, TSV 초안 생성 |
| Edit | tracker 관련 파일 수정 |
| Canva MCP | 선택적 시각형 CV 생성 |
| Bash | `node generate-pdf.mjs` 등 스크립트 실행 |

### 한국 취업 시장 -- 체크 포인트

한국어 공고나 한국 시장 보상 협상에서는 아래 항목을 반드시 확인합니다.

- **연봉 표기 방식:** 기본급인지 총보상(TC)인지 구분합니다. 성과급, 인센티브, RSU/스톡옵션을 분리해 봅니다.
- **정규직 / 계약직 / 프리랜서:** 고용 형태에 따라 안정성, 갱신 리스크, 복리후생을 따로 봅니다.
- **수습기간:** 보통 3개월 전후. 수습 중 급여 감액 여부를 확인합니다.
- **포괄임금제:** 초과근무 수당이 이미 포함된 구조인지, 실제 근무 강도와 맞는지 체크합니다.
- **퇴직금 / 4대보험:** 총보상 비교 시 빠뜨리지 않습니다.
- **복리후생:** 식대, 교통비, 복지포인트, 교육비, 장비 지원, 재택 지원 등을 확인합니다.
- **주식 보상:** 스톡옵션/RSU는 베스팅, 행사 조건, 유동성 가능성을 따로 평가합니다.
- **비자 / 취업 가능 여부:** 외국인 후보자라면 E-7, F계열 등 실제 취업 가능 상태를 명확히 답변합니다.

### 오퍼까지의 시간 우선순위

- 완벽함보다 작동하는 데모와 수치
- 더 늦은 지원보다 더 빠른 지원
- 모든 것을 깊게 하기보다 80/20로 시간 제한

---

## 문서 작성 & ATS 호환성

이 규칙은 PDF 요약, bullet, 커버레터, 지원서 답변, LinkedIn 메시지 등 후보자-facing 문서에 적용합니다. 내부 평가 report에는 그대로 적용하지 않아도 됩니다.

### 흔한 클리셰 피하기

- "열정이 있습니다", "results-oriented", "proven track record"
- `leveraged`, `spearheaded`, `facilitated`
- `robust`, `seamless`, `cutting-edge`, `innovative`
- "오늘날처럼 빠르게 변화하는 세상에서"
- "demonstrated ability to", "best practices"

### ATS용 문자 정규화

`generate-pdf.mjs`가 em-dash, smart quote, zero-width 문자를 ASCII에 가깝게 정규화합니다. 그래도 애초에 그런 문자를 많이 생성하지 않는 편이 좋습니다.

### 문장 구조 다양화

- 모든 bullet을 같은 동사로 시작하지 않습니다
- 짧은 문장과 맥락 있는 문장을 섞습니다
- 항상 "A, B, C" 3단 구조만 반복하지 않습니다

### 추상어보다 구체성

- "성능을 개선했다"보다 "p95 latency를 2.1초에서 380ms로 줄였다"
- "확장 가능한 RAG를 설계했다"보다 "12k 문서를 Postgres + pgvector로 검색했다"
- 가능하면 도구, 프로젝트, 고객 맥락을 명시합니다
