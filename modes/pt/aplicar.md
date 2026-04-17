# Modo: aplicar -- Assistente de Candidatura ao Vivo

Modo interativo para quando o candidato esta preenchendo um formulario de candidatura no Chrome. Le o que esta na tela, carrega o contexto da avaliacao previa da vaga e gera respostas personalizadas para cada pergunta do formulario.

## Requisitos

- **Melhor com Playwright visivel**: No modo visivel, o candidato ve o navegador e Claude pode interagir com a pagina.
- **Sem Playwright**: o candidato compartilha um screenshot ou cola as perguntas manualmente.

## Workflow

```
1. DETECTAR    → Ler aba ativa do Chrome (screenshot/URL/titulo)
2. IDENTIFICAR → Extrair empresa + vaga da pagina
3. BUSCAR      → Match contra reports existentes em reports/
4. CARREGAR    → Ler report completo + Bloco G (se existir)
5. COMPARAR    → A vaga na tela coincide com a avaliada? Se mudou → avisar
6. ANALISAR    → Identificar TODAS as perguntas visiveis do formulario
7. GERAR       → Para cada pergunta, gerar resposta personalizada
8. APRESENTAR  → Mostrar respostas formatadas para copy-paste
```

## Passo 1 -- Detectar a vaga

**Com Playwright:** Tirar snapshot da pagina ativa. Ler titulo, URL e conteudo visivel.

**Sem Playwright:** Pedir ao candidato que:
- Compartilhe um screenshot do formulario (o Read tool le imagens)
- Ou cole as perguntas do formulario como texto
- Ou diga empresa + vaga para buscarmos o contexto

## Passo 2 -- Identificar e buscar contexto

1. Extrair nome da empresa e titulo da vaga da pagina
2. Buscar em `reports/` pelo nome da empresa (Grep case-insensitive)
3. Se houver match → carregar o report completo
4. Se houver Bloco G → carregar os rascunhos de respostas anteriores como base
5. Se NAO houver match → avisar e oferecer executar auto-pipeline rapida

## Passo 3 -- Detectar mudancas na vaga

Se a vaga na tela difere da avaliada:
- **Avisar o candidato**: "A vaga mudou de [X] para [Y]. Quer que eu reavalie ou adapto as respostas ao novo titulo?"
- **Se adaptar**: Ajustar as respostas ao novo titulo sem reavaliar
- **Se reavaliar**: Executar avaliacao completa A-F, atualizar report, regenerar Bloco G
- **Atualizar tracker**: Alterar titulo da vaga em `applications.md` se necessario

## Passo 4 -- Analisar perguntas do formulario

Identificar TODAS as perguntas visiveis:
- Campos de texto livre (carta de apresentacao, por que essa vaga, motivacao, etc.)
- Dropdowns (como ficou sabendo da vaga, autorizacao de trabalho, etc.)
- Sim/Nao (mudanca de cidade, visto, disponibilidade, etc.)
- Campos de salario (faixa, pretensao salarial)
- Campos de upload (curriculo, carta de apresentacao em PDF)

Classificar cada pergunta:
- **Ja respondida no Bloco G** → adaptar a resposta existente
- **Pergunta nova** → gerar resposta a partir do report + CV relevante em `resumes/`

## Passo 5 -- Gerar respostas

Para cada pergunta, gerar a resposta seguindo:

1. **Contexto do report**: Usar proof points do Bloco B, historias STAR do Bloco F
2. **Bloco G anterior**: Se existe um rascunho, usar como base e refinar
3. **Tom "Estou escolhendo voces"**: Mesmo framework da auto-pipeline — confiante, nao suplicante
4. **Especificidade**: Referenciar algo concreto do JD visivel na tela
5. **career-ops proof point**: Incluir em "Informacoes adicionais" se houver campo para isso

**Campos especificos do mercado brasileiro que aparecem com frequencia:**
- **Pretensao salarial (bruto, mensal ou anual)** → Faixa de `profile.yml`, em BRL, com nota "negociavel conforme pacote total"
- **Regime de contratacao preferido (CLT/PJ)** → Responder conforme `profile.yml`, ou "aberto a ambos" se aplicavel
- **Disponibilidade / prazo para inicio** → Data realista considerando aviso previo atual (CLT: 30 dias + 3 dias/ano)
- **Autorizacao de trabalho** → Responder com clareza; se brasileiro: "Cidadao brasileiro, nao necessita autorizacao"
- **Idiomas** → Informar nivel por idioma (nativo, fluente, intermediario, basico)

**Formato de output:**

```
## Respostas para [Empresa] -- [Vaga]

Base: Report #NNN | Score: X.X/5 | Arquetipo: [tipo]

---

### 1. [Pergunta exata do formulario]
> [Resposta pronta para copy-paste]

### 2. [Proxima pergunta]
> [Resposta]

...

---

Notas:
- [Qualquer observacao sobre a vaga, mudancas, etc.]
- [Sugestoes de personalizacao que o candidato deveria revisar]
```

## Passo 6 -- Pos-candidatura (opcional)

Se o candidato confirmar que enviou a candidatura:
1. Atualizar status em `applications.md` de "Evaluated" para "Applied"
2. Atualizar Bloco G do report com as respostas finais
3. Sugerir proximo passo: `/career-ops outreach` para LinkedIn outreach

## Scroll handling

Se o formulario tem mais perguntas do que as visiveis:
- Pedir ao candidato para dar scroll e compartilhar outro screenshot
- Ou colar as perguntas restantes
- Processar em iteracoes ate cobrir todo o formulario
