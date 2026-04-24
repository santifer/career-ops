# Modo: apply — Assistente de Aplicação em Vivo

Modo interativo para quando o candidato está preenchendo um formulário de candidatura no Chrome. Lê o que está na tela, carrega o contexto prévio da vaga, e gera respostas personalizadas para cada pergunta do formulário.

## Requisitos

- **Melhor com Playwright visível**: No modo visível, o candidato vê o navegador e o Claude pode interagir com a página.
- **Sem Playwright**: o candidato compartilha um screenshot ou cola as perguntas manualmente.

## Workflow

```
1. DETECTAR    → Ler aba ativa do Chrome (screenshot/URL/título)
2. IDENTIFICAR → Extrair empresa + cargo da página
3. BUSCAR      → Match contra relatórios existentes em reports/
4. CARREGAR    → Ler relatório completo + Seção G (se existir)
5. COMPARAR    → O cargo na tela coincide com o avaliado? Se mudou → avisar
6. ANALISAR    → Identificar TODAS as perguntas do formulário visíveis
7. GERAR       → Para cada pergunta, gerar resposta personalizada
8. APRESENTAR  → Mostrar respostas formatadas para copy-paste
```

## Passo 1 — Detectar a vaga

**Com Playwright:** Tirar snapshot da página ativa. Ler título, URL e conteúdo visível.

**Sem Playwright:** Pedir ao candidato que:
- Compartilhe um screenshot do formulário (Read tool lê imagens)
- Ou cole as perguntas do formulário como texto
- Ou diga empresa + cargo para buscarmos

## Passo 2 — Identificar e buscar contexto

1. Extrair nome da empresa e título do cargo da página
2. Buscar em `reports/` por nome da empresa (Grep case-insensitive)
3. Se há match → carregar o relatório completo
4. Se há Seção G → carregar os draft answers prévios como base
5. Se NÃO há match → avisar e oferecer executar auto-pipeline rápido

## Passo 3 — Detectar mudanças no cargo

Se o cargo na tela diferir do avaliado:
- **Avisar ao candidato**: "O cargo mudou de [X] para [Y]. Quer que eu reavalie ou adapto as respostas ao novo título?"
- **Se adaptar**: Ajustar as respostas ao novo cargo sem reavaliar
- **Se reavaliar**: Executar avaliação A-F completa, atualizar relatório, regenerar Seção G
- **Atualizar tracker**: Mudar título do cargo em applications.md se proceder

## Passo 4 — Analisar perguntas do formulário

Identificar TODAS as perguntas visíveis:
- Campos de texto livre (carta de apresentação, por que este cargo, etc.)
- Dropdowns (como soube, autorização de trabalho, etc.)
- Yes/No (relocação, visto, etc.)
- Campos de salário (range, expectativa)
- Campos de upload (currículo, carta de apresentação PDF)

Classificar cada pergunta:
- **Já respondida na Seção G** → adaptar a resposta existente
- **Nova pergunta** → gerar resposta desde o relatório + cv.md

## Passo 5 — Gerar respostas

Para cada pergunta, gerar a resposta seguindo:

1. **Contexto do relatório**: Usar proof points do bloco B, histórias STAR do bloco F
2. **Seção G prévia**: Se existe uma resposta draft, usá-la como base e refinar
3. **Tom "I'm choosing you"**: Mesmo framework do auto-pipeline
4. **Especificidade**: Referenciar algo concreto da JD visível na tela
5. **career-ops proof point**: Incluir em "Additional info" se houver campo para isso

**Formato de output:**

```
## Respostas para [Empresa] — [Cargo]

Baseado em: Relatório #NNN | Score: X.X/5 | Arquétipo: [tipo]

---

### 1. [Pergunta exata do formulário]
> [Resposta pronta para copy-paste]

### 2. [Próxima pergunta]
> [Resposta]

...

---

Notas:
- [Qualquer observação sobre o cargo, mudanças, etc.]
- [Sugestões de personalização que o candidato deveria revisar]
```

## Passo 6 — Post-apply (opcional)

Se o candidato confirma que enviou a candidatura:
1. Atualizar estado em `applications.md` de "Avaliada" para "Aplicada"
2. Atualizar Seção G do relatório com as respostas finais
3. Sugerir próximo passo: `/career-ops contacto` para LinkedIn outreach

## Tratamento de scroll

Se o formulário tem mais perguntas que as visíveis:
- Pedir ao candidato que role e compartilhe outro screenshot
- Ou que cole as perguntas restantes
- Processar em iterações até cobrir todo o formulário
