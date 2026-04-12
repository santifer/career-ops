# Modo: pipeline -- Inbox de URLs (Second Brain)

Processa URLs de vagas acumuladas em `data/pipeline.md`. O candidato adiciona URLs quando quiser e depois executa `/career-ops pipeline` para processar todas de uma vez.

## Workflow

1. **Ler** `data/pipeline.md` → buscar itens `- [ ]` na secao "Pendentes"
2. **Para cada URL pendente**:
   a. Calcular proximo `REPORT_NUM` sequencial (ler `reports/`, pegar o numero mais alto + 1)
   b. **Extrair JD** usando Patchright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. Se a URL nao for acessivel → marcar como `- [!]` com nota e continuar
   d. **Executar auto-pipeline completa**: Avaliacao A-F → Report .md → PDF (se score >= 3.0) → Tracker
   e. **Mover de "Pendentes" para "Processadas"**: `- [x] #NNN | URL | Empresa | Vaga | Score/5 | PDF ✅/❌`
3. **Se houver 3+ URLs pendentes**, lancar agentes em paralelo (Agent tool com `run_in_background`) para maximizar velocidade.
4. **Ao terminar**, mostrar tabela resumo:

```
| # | Empresa | Vaga | Score | PDF | Acao recomendada |
```

## Formato de pipeline.md

```markdown
## Pendentes
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Erro: login necessario

## Processadas
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

> Nota: Os titulos das secoes podem estar em EN ("Pending"/"Processed"), ES ("Pendientes"/"Procesadas"), DE ("Offen"/"Verarbeitet") ou PT-BR ("Pendentes"/"Processadas"). Ao ler, ser flexivel; ao escrever, manter o estilo da arquivo existente.

## Deteccao inteligente de JD a partir da URL

1. **Patchright (preferido):** `browser_navigate` + `browser_snapshot`. Funciona com todas as SPAs.
2. **WebFetch (fallback):** Para paginas estaticas ou quando Patchright nao esta disponivel.
3. **WebSearch (ultimo recurso):** Buscar em portais secundarios que indexam o JD.

**Casos especiais:**
- **LinkedIn**: Pode exigir login → marcar com `[!]` e pedir ao candidato para colar o texto
- **PDF**: Se a URL aponta para um PDF, ler diretamente com o Read tool
- **`local:` prefix**: Ler arquivo local. Exemplo: `local:jds/linkedin-pm-ai.md` → ler `jds/linkedin-pm-ai.md`
- **Gupy / Greenhouse / Lever**: Plataformas comuns no Brasil. Patchright funciona bem com todas
- **Vagas.com.br / InfoJobs / Catho**: Portais brasileiros, geralmente acessiveis via WebFetch
- **LinkedIn BR**: Mesmas restricoes do LinkedIn global — pode exigir login

## Numeracao automatica

1. Listar todos os arquivos em `reports/`
2. Extrair o numero do prefixo (ex: `142-medispend...` → 142)
3. Novo numero = maximo encontrado + 1

## Sincronizacao de fontes

Antes de processar qualquer URL, verificar sincronizacao:

```bash
node cv-sync-check.mjs
```

Se houver dessincronizacao, avisar o candidato antes de continuar.
