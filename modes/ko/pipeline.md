# 모드: pipeline -- URL Inbox (Second Brain)

`data/pipeline.md`에 쌓아 둔 채용 공고 URL을 한 번에 처리합니다.

## Workflow

1. `data/pipeline.md`를 읽고 "Pending" 섹션의 `- [ ]` 항목을 찾습니다
2. 각 pending URL마다:
   a. `reports/`를 읽어 다음 `REPORT_NUM`을 계산
   b. Playwright (`browser_navigate` + `browser_snapshot`) → WebFetch → WebSearch 순서로 JD 추출
   c. URL 접근이 안 되면 `- [!]`로 표시하고 메모를 남긴 뒤 계속 진행
   d. auto-pipeline 전체 실행: A-F 평가 → report `.md` → PDF(점수 3.0 이상) → tracker
   e. "Pending"에서 "Processed"로 이동: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`
3. pending URL이 3개 이상이면 가능한 범위에서 병렬 agent를 사용합니다. 단, Playwright는 병렬로 돌리지 않습니다.
4. 마지막에 요약 표를 보여줍니다.

```markdown
| # | Company | Role | Score | PDF | Recommended action |
```

## `pipeline.md` 형식

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

> 참고: 섹션 제목은 `Pending/Processed`, `Pendientes/Procesadas`, `Offen/Verarbeitet`, `Pendentes/Processadas`처럼 기존 스타일이 섞여 있을 수 있습니다. 읽을 때는 유연하게, 쓸 때는 파일의 기존 스타일을 유지합니다.

## URL에서 JD 뽑기

1. **Playwright 우선:** SPA 포함 거의 모든 채용 페이지에 가장 안정적
2. **WebFetch fallback:** 정적 페이지일 때
3. **WebSearch 최후 수단:** 다른 포털에 인덱싱된 공고 확인

**특수 케이스:**

- **LinkedIn** → 로그인 필요 시 `[!]`로 표시하고 사용자에게 텍스트를 요청
- **PDF URL** → Read 도구로 직접 읽기
- **`local:` prefix** → 로컬 파일 읽기. 예: `local:jds/example.md`
- **원티드 / 사람인 / 잡코리아 / 리멤버 / 점핏** → Playwright를 우선, 정적 페이지면 WebFetch fallback

## 자동 번호 매기기

1. `reports/` 전체 파일명 확인
2. 앞의 숫자 prefix 추출
3. 가장 큰 번호 + 1 사용

## 소스 동기화

어떤 URL이든 처리하기 전에 먼저 동기화 확인:

```bash
node cv-sync-check.mjs
```

불일치가 있으면 사용자에게 먼저 알립니다.
