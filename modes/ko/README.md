# career-ops -- 한국어 모드 (`modes/ko/`)

이 폴더에는 한국어 채용 공고를 평가하고 지원할 때 쓰는 career-ops 핵심 모드의 한국어 버전이 들어 있습니다.

## 언제 사용하나요?

다음 중 하나라도 해당하면 `modes/ko/`를 쓰는 것이 좋습니다:

- 주로 **한국어 채용 공고**에 지원한다
- 이력서나 지원서 답변을 **자연스러운 한국어**로 만들고 싶다
- 한국 채용 시장의 표현과 제도(정규직/계약직, 수습기간, 포괄임금제, 퇴직금, 4대보험, 복지포인트, 스톡옵션 등)를 제대로 반영해야 한다
- 한국 기업 또는 한국 지사 채용 페이지에서 자주 나오는 질문(희망연봉, 입사 가능일, 병역/비자, 근무 형태 등)에 맞춰 답변해야 한다

영문 공고가 대부분이라면 기본 모드 `modes/`를 유지하세요. 한국 회사라도 공고와 지원 문서가 영어 중심이면 기본 영어 모드가 더 적합할 수 있습니다.

## 어떻게 활성화하나요?

career-ops에는 하드코딩된 언어 스위치가 없습니다. 대신 두 가지 방식이 있습니다.

### 방법 1 -- 세션별로 지정

세션 시작 시 이렇게 요청하면 됩니다:

> "이제부터 한국어 모드 `modes/ko/`를 사용해줘."

또는

> "한국어로 평가와 지원서 답변을 작성해줘. `modes/ko/_shared.md`와 `modes/ko/offer.md`를 써."

그러면 에이전트가 기본 `modes/` 대신 이 폴더의 파일을 읽습니다.

### 방법 2 -- 프로필에서 기본값 지정

`config/profile.yml`에 언어 설정을 추가합니다:

```yaml
language:
  primary: ko
  modes_dir: modes/ko
```

첫 세션에서 "내 `profile.yml`의 `language.modes_dir`를 따라줘"라고 한 번 알려주면 이후에는 자동으로 한국어 모드를 우선할 수 있습니다.

> 참고: `language.modes_dir`는 이 저장소에서 사용하는 관례입니다. 필요하면 나중에 이름을 바꿔도 됩니다.

## 무엇이 번역되었나요?

첫 번째 한국어 버전은 활용도가 높은 4개 파일을 포함합니다:

| 파일 | 원본 | 용도 |
|------|------|------|
| `_shared.md` | `modes/_shared.md` | 공통 규칙, 점수 체계, 도구 사용법, 한국 시장 체크포인트 |
| `offer.md` | 기존 평가 모드 계열 | 단일 공고 평가 A-F 블록 |
| `apply.md` | `modes/apply.md` | 라이브 지원서 작성 보조 |
| `pipeline.md` | `modes/pipeline.md` | `data/pipeline.md`에 쌓인 URL 일괄 처리 |

다른 모드(`scan`, `batch`, `pdf`, `tracker`, `auto-pipeline`, `deep`, `outreach`, `project`, `training`)는 이번 변경에 포함하지 않았습니다. 이들은 여전히 기본 영어 모드로 잘 동작하며, 경로/스크립트/툴링 중심이라 언어 의존도가 낮습니다.

## 무엇은 영어로 남겨두나요?

다음 항목은 의도적으로 영어 표기나 기존 코드명을 유지합니다:

- `cv.md`, `pipeline`, `tracker`, `report`, `score`, `archetype`, `proof point`
- 툴 이름(`Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Bash`)
- 트래커 상태값(`Evaluated`, `Applied`, `Interview`, `Offer`, `Rejected`)
- 코드 블록, 경로, 명령어

문체는 "억지 번역"이 아니라 한국의 실제 테크 채용 문맥에 맞는 자연스러운 한국어를 목표로 합니다. 필요할 때는 `LLMOps`, `pipeline`, `deployment` 같은 업계 용어를 그대로 둡니다.

## 용어 가이드

| 영어 | 한국어 |
|------|--------|
| Job posting | 채용 공고 |
| Application | 지원 / 지원서 |
| Cover letter | 자기소개서 / 커버레터 |
| Resume / CV | 이력서 |
| Salary | 연봉 / 급여 |
| Compensation | 보상 패키지 / 총보상 |
| Skills | 역량 / 기술 |
| Interview | 면접 |
| Hiring manager | 채용 매니저 |
| Recruiter | 리크루터 |
| Requirements | 자격 요건 / 요구사항 |
| Career history | 경력 / 커리어 이력 |
| Notice period | 입사 가능 시점 / 퇴사 통보 기간 |
| Probation | 수습기간 |
| Permanent employment | 정규직 |
| Fixed-term contract | 계약직 |
| Retirement pay | 퇴직금 |
| National insurance | 4대보험 |
| Stock options | 스톡옵션 |
| Meal allowance | 식대 |

## 기여 방법

한국어 표현을 다듬거나 다른 모드를 추가하고 싶다면:

1. 기존 구조와 파일 이름 규칙을 유지합니다
2. 직역보다 **실제 한국 채용 문맥에 맞는 표현**을 우선합니다
3. 블록 구조(A-F), 표, 코드 블록, 도구 지시는 원형을 유지합니다
4. 가능하면 실제 한국어 공고로 한 번 검증한 뒤 PR을 엽니다
