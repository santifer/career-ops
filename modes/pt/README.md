# career-ops -- Modos em Portugues BR (`modes/pt/`)

Esta pasta contem as traducoes em portugues brasileiro dos principais modos do career-ops para candidatos que buscam vagas no mercado brasileiro ou em empresas que operam em portugues.

## Quando usar estes modos?

Use `modes/pt/` se pelo menos uma das condicoes abaixo for verdadeira:

- Voce se candidata principalmente a **vagas em portugues** (Gupy, Greenhouse BR, LinkedIn BR, Vagas.com.br, Catho, InfoJobs)
- Sua **lingua do curriculo** e portugues ou voce alterna entre PT-BR e EN conforme a vaga
- Voce precisa de respostas e cartas de apresentacao em **portugues tech natural**, nao traduzido por maquina
- Voce precisa lidar com **especificidades do mercado brasileiro**: CLT vs PJ, 13o salario, FGTS, PLR, vale-refeicao, plano de saude, aviso previo, periodo de experiencia

Se a maioria das suas vagas e em ingles, fique com os modos padrao em `modes/`. Os modos em ingles funcionam automaticamente quando Claude detecta uma vaga em portugues — mas nao conhecem as particularidades do mercado brasileiro no mesmo nivel de detalhe.

## Como ativar?

O career-ops nao tem um "switch de idioma" como flag de codigo. Em vez disso, existem dois caminhos:

### Caminho 1 -- Por sessao, via comando

Diga ao Claude no inicio da sessao:

> "Use os modos em portugues de `modes/pt/`."

ou

> "Avaliar e candidaturas em portugues -- use `modes/pt/_shared.md` e `modes/pt/oferta.md`."

Claude vai ler os arquivos desta pasta em vez de `modes/`.

### Caminho 2 -- Permanente, via perfil

Adicione em `config/profile.yml` uma preferencia de idioma:

```yaml
language:
  primary: pt-br
  modes_dir: modes/pt
```

Lembre o Claude na primeira sessao de respeitar esse campo ("Olha no `profile.yml`, eu configurei `language.modes_dir`"). A partir dai, Claude usa automaticamente os modos em portugues.

> Nota: O campo `language.modes_dir` e uma convencao, nao um schema rigido. Se os mantenedores quiserem estruturar diferente, o campo pode ser renomeado a qualquer momento.

## O que foi traduzido?

Esta primeira iteracao cobre os quatro modos com maior impacto:

| Arquivo | Traduzido de | Finalidade |
|---------|-------------|------------|
| `_shared.md` | `modes/_shared.md` (EN) | Contexto compartilhado, arquetipos, regras globais, especificidades do mercado BR |
| `oferta.md` | `modes/oferta.md` (ES) | Avaliacao completa de uma vaga (Blocos A-F) |
| `aplicar.md` | `modes/apply.md` (EN) | Assistente ao vivo para formularios de candidatura |
| `pipeline.md` | `modes/pipeline.md` (ES) | Inbox de URLs / Second Brain para vagas acumuladas |

Os demais modos (`scan`, `batch`, `pdf`, `tracker`, `auto-pipeline`, `deep`, `contacto`, `ofertas`, `project`, `training`) nao estao neste PR de proposito. Eles continuam funcionando via os originais em EN/ES, pois seu conteudo e majoritariamente tooling, caminhos e comandos de configuracao — que devem ser independentes de idioma.

Se a comunidade adotar os modos em portugues, mais modos serao traduzidos em PRs futuros.

## O que continua em ingles?

Propositalmente nao traduzido, porque e vocabulario padrao de tech:

- `cv.md`, `pipeline`, `tracker`, `report`, `score`, `archetype`, `proof point`
- Nomes de tools (`Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Bash`)
- Valores de status no tracker (`Evaluated`, `Applied`, `Interview`, `Offer`, `Rejected`)
- Code snippets, caminhos de arquivo, comandos

Os modos usam portugues tech brasileiro, como se fala em times de engenharia reais em Sao Paulo, Florianopolis ou Belo Horizonte: texto corrido em portugues, termos tecnicos em ingles onde sao de uso comum. Nada de traduzir "pipeline" para "tubulacao" ou "cv.md" para "curriculo.md".

## Vocabulario de Referencia

Se voce for adaptar ou expandir os modos, siga este vocabulario para manter a consistencia de tom:

| Ingles | Portugues BR (nesta codebase) |
|--------|-------------------------------|
| Job posting | Vaga / Descricao da vaga |
| Application | Candidatura |
| Cover letter | Carta de apresentacao |
| Resume / CV | Curriculo |
| Salary | Salario / Remuneracao |
| Compensation | Remuneracao |
| Skills | Habilidades / Competencias |
| Interview | Entrevista |
| Hiring manager | Gestor da vaga / Hiring manager |
| Recruiter | Recrutador(a) |
| AI | IA (Inteligencia Artificial) |
| Requirements | Requisitos |
| Career history | Trajetoria profissional / Experiencia |
| Notice period | Aviso previo |
| Probation | Periodo de experiencia |
| Vacation | Ferias |
| 13th month salary | 13o salario |
| Formal employment (CLT) | CLT / Carteira assinada |
| Contractor (PJ) | PJ (Pessoa Juridica) |
| Profit sharing | PLR (Participacao nos Lucros e Resultados) |
| Health insurance | Plano de saude |
| Meal voucher | Vale-refeicao / Vale-alimentacao |
| Severance fund | FGTS (Fundo de Garantia) |
| Stock options | Stock options (termo ja usado em PT-BR) |

## Contribuir

Se quiser melhorar uma traducao ou traduzir um modo adicional:

1. Abra uma issue com a proposta (conforme `CONTRIBUTING.md`)
2. Siga o vocabulario acima para manter o tom consistente
3. Traduza de forma natural e idiomatica — nada de traducao literal palavra por palavra
4. Mantenha os elementos estruturais (Bloco A-F, tabelas, blocos de codigo, instrucoes de tools) exatamente iguais
5. Teste com uma vaga real brasileira (ex: do Gupy ou LinkedIn BR) antes de abrir o PR
