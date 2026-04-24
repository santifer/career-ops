# Browser Session -- Padrões de Autonomia

<!-- ============================================================
     Referência compartilhada para TODA interação autônoma de browser.
     Referenciado por: scan.md, apply.md, pipeline.md, auto-pipeline.md
     Governança: seção "Browser Autonomy" do CLAUDE.md
     Regras HITL: seção "HITL Boundaries" do _shared.md
     ============================================================ -->

Este arquivo define os padrões que todo modo usa ao interagir com um navegador via Playwright MCP. É a fonte única de verdade para loops de decisão, gestão de sessão, tratamento de obstáculos, detecção de CAPTCHA/2FA, o gate de submissão, lógica de retry e log de ações.

**Como usar este arquivo**: Quando o workflow de um modo chega a um ponto de interação de browser, siga as seções abaixo em ordem. Comece pelo Protocolo do Loop de Decisão, aplique Gestão de Sessão se o portal requer login, use Desobstrução de Obstáculos após cada navegação, e aplique o Gate de Submissão antes de qualquer ação irreversível.

---

## Protocolo do Loop de Decisão

Toda interação autônoma de browser segue um ciclo snapshot-decide-act-resnapshot:

1. **Snapshot** -- Chame `browser_snapshot` para ler o estado atual da página como uma árvore de acessibilidade ARIA (YAML, ~2-5 KB). Analise roles, nomes e refs de elementos (ex: `textbox "Full Name" [ref=e7]`).
2. **Decida** -- Com base no conteúdo do snapshot, determine a próxima ação: navegar, clickar, preencher, digitar, esperar, ou escalar para HITL.
3. **Aja** -- Execute a ação escolhida usando a ref do elemento do snapshot.
4. **Resnapshot** -- Chame `browser_snapshot` novamente para verificar se a ação teve sucesso antes de prosseguir.

**Limites de segurança** (previnem loops infinitos):
- Máx iterações: **50 ciclos** por fluxo.
- Máx tempo real: **5 minutos** por execução de fluxo.
- Se a meta não for atingida dentro dos limites, pare e relate o progresso ao usuário com um resumo dos passos completados.

**Regras**:
- Sempre tire um novo `browser_snapshot` no início de cada passo. Nunca assuma estado da página de um snapshot anterior após qualquer navegação ou espera.
- Refs de elementos (`e5`, `e12`) são escopo-da-sessão. Após qualquer navegação que recarregue a página, resnapshot antes de usar refs -- podem ter mudado.
- Use roles e labels ARIA (`textbox "Email"`, `button "Submit"`) ao invés de seletores CSS. Resilientes entre plataformas ATS e redesigns de portais.

---

## Gestão de Sessão

Para portais que requerem autenticação (`requires_login: true` em `portals.yml`).

### Arquivos de sessão

- Convenção de caminho: `data/sessions/<portal-slug>.json` (gitignored -- contém tokens de auth)
- Formato: Playwright `storageState` JSON com arrays de `cookies` e `origins`
- Perfil persistente do Playwright MCP armazena cookies automaticamente entre sessões via dir de cache do SO

### Padrão de carregamento

Antes de navegar a um portal autenticado:
1. Verifique `portals.yml` para `requires_login: true` e caminho de `cookie_file`.
2. Se um arquivo de sessão existe, o perfil persistente do Playwright MCP já deve ter cookies do login manual prévio do usuário.
3. Navegue para a URL do portal.
4. Snapshot imediatamente para verificar validade da sessão.

### Verificação de validade

Após navegar, examine o snapshot:
- **Sessão válida**: Nenhum formulário de login presente. Portal mostra conteúdo autenticado (dashboard, menu de perfil, nome do usuário).
- **Sessão expirada**: Snapshot contém elementos de formulário de login (ex: `textbox "Email"` + `button "Sign in"`).

### Tratamento de expiração

Se a sessão expirou:
1. Pare o fluxo imediatamente.
2. Output sinal HITL: `{ hitl: true, reason: "session_expired", message: "Session expired -- please log in to the portal and type 'resume'" }`.
3. NÃO tente inserir credenciais. O usuário deve autenticar manualmente.

---

## Desobstrução de Obstáculos

Após cada `browser_navigate` + primeiro `browser_snapshot`, verifique obstáculos ANTES de ler conteúdo da página. Desobstrua em ordem:

### Passo 1: Banners de cookie

Procure no snapshot por estes padrões de botão (match case-sensitive no label ARIA):
- `button "Accept all"`
- `button "Accept All"`
- `button "Accept cookies"`
- `button "Allow all"`
- `button "I agree"`
- `button "OK"`
- `button "Got it"`

Se encontrado, click no elemento com ref correspondente. Resnapshot para verificar que o banner desapareceu.

### Passo 2: Dialogs de overlay

Procure no snapshot por `role="dialog"` ou `role="alertdialog"`. Se presente, procure botsões de dispensar:
- `button "Close"`
- `button "x"` (o sinal de multiplicação, não a letra x)
- `button "+"` (Unicode ballot X)
- `button "No thanks"`
- `button "Not now"`
- `button "Maybe later"`
- `button "Dismiss"`
- `button "Skip"`

Dispensar o dialog mais alto primeiro. Resnapshot após cada dismiss.

**Escalação**: Se um dialog está presente mas não existe botão de dismiss conhecido, pare e notifique o usuário. Não adivinhe -- alguns dialogs podem ser legítimos (aceite de termos, consentimento requerido).

---

## Detecção de CAPTCHA

Verifique todo snapshot por estas frases de sinal (case-insensitive):

- `I'm not a robot`
- `verify you are human`
- `hcaptcha`
- `recaptcha`

**Ação**: PARADA IMEDIATA. Sem exceções.

Output sinal HITL:
```
{ hitl: true, reason: "captcha", message: "CAPTCHA detected -- please resolve it in the browser and type 'resume'" }
```

**NUNCA tente resolver um CAPTCHA.** Sempre adie para o humano.

---

## Detecção de 2FA

Verifique todo snapshot por estas frases de sinal:

- `Verification Code`
- `One-time password`
- `Authentication code`
- `Enter the code`
- `Authenticator app`
- `Check your email for a code`

**Ação**: PARADA IMEDIATA.

Output sinal HITL:
```
{ hitl: true, reason: "2fa", message: "2FA required -- please complete authentication and type 'resume'" }
```

---

## Gate de Submissão (CRÍTICO)

Este gate enforce a regra ética em CLAUDE.md: "NUNCA submeta uma aplicação sem o usuário revisar primeiro."

**Gatilho**: Antes de clicar EM QUALQUER botão que possa submeter um formulário. Match estes labels de botão:
- Submit, Apply, Send, Bewerben, Absenden, Post, Continue (quando "Continue" é o passo final que submete)

**Protocolo**:
1. PARE. Não click o botão.
2. Apresente um resumo de todos os campos preenchidos e seus valores:
   ```
   Submission Gate -- Review before sending:
   - Name: "John Doe"
   - Email: "john@example.com"
   - Cover Letter: [attached, 1 page]
   - Phone: "+1-555-0123"
   - Salary expectation: "90,000 EUR"

   Type "go" to submit or "abort" to cancel.
   ```
3. Espere o usuário responder.
   - Usuário diz "go" -- prossiga com o click.
   - Usuário diz "abort" -- pare o fluxo, não submeta.
4. Log o evento do gate no log de ações com `outcome: "hitl_pause"` e `detail: "submit"`.

**SEM EXCEÇÕES.** Isto se aplica a todo portal, todo formulário, todo modo. O gate de submissão é inegociável.

---

## Política de Retry

Para falhas transitórias (erros de rede, elemento não encontrado, conteúdo inesperado da página):

| Tentativa | Espera antes de retry | Ação |
|-----------|----------------------|------|
| 1º retry | 2 segundos | Renavegar ou resnapshot, tentar ação novamente |
| 2º retry | 5 segundos | Renavegar ou resnapshot, tentar ação novamente |
| 3º retry | 10 segundos | Renavegar ou resnapshot, tentar ação novamente |
| Após 3 falhas | -- | Escalar para usuário ou marcar `[!]` e pular |

**Comportamento de escalação** depende de `captcha_strategy` em `portals.yml`:
- `"stop"` (padrão): Pare o fluxo e notifique o usuário com contexto de erro.
- `"skip"`: Marque a URL como `[!]` em `pipeline.md` com uma nota (ex: "Failed after 3 retries -- element not found"), depois continue para o próximo alvo.

**Falhas qualificáveis**: Timeout de navegação, elemento não encontrado no snapshot, conteúdo inesperado da página (ex: 404, página de erro), ação não produziu mudança de estado esperada.

---

## Log de Ações

Todo fluxo autônomo de browser DEVE produzir um log de ações.

### Convenção de arquivo

- Diretório: `logs/` (gitignored -- pode conter PII de valores de campos de formulário)
- Nome: `logs/flow-run-<ISO-timestamp>.ndjson`
- Exemplo: `logs/flow-run-2026-04-07T14-30-00Z.ndjson`
- Um arquivo por execução de fluxo. Rotaciona por execução, não por tamanho.

### Schema de entrada (NDJSON -- um objeto JSON por linha)

```
{
  "timestamp": "ISO 8601",
  "step_id": "string (ex: 'dismiss_cookie_banner', 'fill_name')",
  "action": "navigate | click | fill | snapshot | hitl | wait",
  "target_ref": "string | null (ARIA ref, ex: 'e12')",
  "outcome": "success | failure | skipped | hitl_pause",
  "detail": "string (opcional -- mensagem de erro ou razão HITL)"
}
```

### Regras

- **Flush após cada entrada** -- não em buffer. Use `appendFileSync` ou equivalente. Isso garante que execuções parciais são recuperáveis.
- Logue cada ação: navegações, clicks, fills, snapshots, pausas HITL, esperas.
- Logue falhas com `detail` contendo a mensagem de erro.
- Logue pausas HITL com `detail` contendo a razão (`"captcha"`, `"2fa"`, `"submit"`, `"session_expired"`).

---

## Detecção de Fluxo Obsoleto

Quando a UI do portal mudou e elementos esperados já não estão onde deveriam estar:

1. Se um elemento esperado não é encontrado no snapshot dentro de **10 segundos** (use `browser_wait_for` com timeout), assuma que a definição do fluxo está obsoleta.
2. Recorra à **interpretação de estado da página**: leia o que ESTÁ na página do snapshot atual. Identifique elementos por suas roles e labels ARIA, não por posições assumidas.
3. Notifique o usuário: "Flow definition may need updating for this portal. Proceeding with best-effort interpretation."
4. Continue usando o protocolo do loop de decisão com o estado real da página.
5. Log a detecção de obsoleto no log de ações: `{ action: "snapshot", outcome: "failure", detail: "stale_flow - element not found: <expected_element>" }`.

---

## Expiração de Sessão Meio do Fluxo

Quando uma sessão de portal expira durante um fluxo multi-passo ativo:

1. **Detecte**: O snapshot mostra elementos de formulário de login quando não deveriam estar lá (ex: `textbox "Email"` + `button "Sign in"` aparecendo no meio do preenchimento).
2. **Pare** o fluxo imediatamente. Não tente re-autenticar.
3. Output sinal HITL:
   ```
   { hitl: true, reason: "session_expired", message: "Session expired during flow -- please re-login and type 'resume'" }
   ```
4. O log de ações preserva um registro de todos os passos completados. Ao resumir, o agente lê o log de ações para determinar onde continuar.

---

## Preservação de Formulário Parcial

Quando um fluxo é interrompido por um gate HITL (CAPTCHA, 2FA, revisão de submissão) ou um erro:

1. O log de ações já contém cada campo preenchido com seu valor e ref. Cada ação de `fill` tem `step_id`, `target_ref`, e `outcome` registrados.
2. O usuário pode revisar o log de ações para ver exatamente o que foi completado antes da interrupção.
3. Ao resumir (após usuário digitar "resume" / "go" / "done"):
   - Agente resnapshota a página atual para verificar estado.
   - Agente lê o log de ações para identificar quais campos já foram preenchidos.
   - Agente continua do próximo campo não preenchido, pulando passos já completados.
4. Se a página foi recarregada (ex: após resolução de CAPTCHA), o agente deve resnapshot e reidentificar todas as refs de elementos -- podem ter mudado.

---

## Referência Rápida: Protocolo de Retomada HITL

Quando o agente outputa um sinal HITL e pausa:

1. Agente para e espera input do usuário.
2. Usuário executa a ação requerida no browser (resolver CAPTCHA, inserir código 2FA, re-login, revisar formulário).
3. Usuário digita "resume" / "go" / "done" no Claude Code.
4. Agente resnapshot a página atual para verificar estado.
5. Agente continua do próximo passo.

O log de ações registra a pausa HITL com `outcome: "hitl_pause"` e `detail` setado com a razão, para o agente poder retomar corretamente.
