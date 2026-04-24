# Modo: pipeline — Inbox de URLs (Second Brain)

Processa URLs de vagas acumuladas em `data/pipeline.md`. O usuário adiciona URLs quando quiser e depois executa `/career-ops pipeline` para processá-las todas.

## Workflow

1. **Ler** `data/pipeline.md` → buscar items `- [ ]` na seção "Pendentes"
2. **Para cada URL pendente**:
   a. Calcular seguinte `REPORT_NUM` sequencial (ler `reports/`, pegar o número mais alto + 1)
   b. **Extrair JD** usando Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. Se a URL não for acessível → marcar como `- [!]` com nota e continuar
   d. **Executar auto-pipeline completo**: Avaliação A-F → Report .md → PDF (se score >= 3.0) → Tracker
   e. **Mover de "Pendentes" para "Processadas"**: `- [x] #NNN | URL | Empresa | Cargo | Score/5 | PDF ✅/❌`
3. **Se há 3+ URLs pendentes**, lançar agentes em paralelo (Agent tool com `run_in_background`) para maximizar velocidade.
4. **Ao terminar**, mostrar tabela resumo:

```
| # | Empresa | Cargo | Score | PDF | Ação recomendada |
```

## Formato de pipeline.md

```markdown
## Pendentes
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Erro: login required

## Processadas
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Detecção inteligente de JD desde URL

1. **Playwright (preferido):** `browser_navigate` + `browser_snapshot`. Funciona com todas as SPAs.
2. **WebFetch (fallback):** Para páginas estáticas ou quando Playwright não está disponível.
3. **WebSearch (último recurso):** Buscar em portais secundários que indexam a JD.

**Casos especiais:**
- **LinkedIn**: Pode requerer login → marcar `[!]` e pedir ao usuário que cole o texto
- **PDF**: Se a URL aponta para um PDF, lê-lo diretamente com Read tool
- **`local:` prefix**: Ler o arquivo local. Exemplo: `local:jds/linkedin-pm-ai.md` → ler `jds/linkedin-pm-ai.md`

## Numeração automática

1. Listar todos os arquivos em `reports/`
2. Extrair o número do prefixo (ex: `142-medispend...` → 142)
3. Novo número = máximo encontrado + 1

## Sincronização de fontes

Antes de processar qualquer URL, verificar sync:
```bash
node cv-sync-check.mjs
```
Se houver dessincronização, alertar ao usuário antes de continuar.
