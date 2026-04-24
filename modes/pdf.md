# Modo: pdf — Geração de PDF ATS-Otimizado

## Pipeline completo

1. Ler `cv.md` como fontes de verdade
2. Pedir ao usuário a JD se não estiver em contexto (texto ou URL)
3. Extrair 15-20 keywords da JD
4. Detectar idioma da JD → idioma do CV (EN padrão)
5. Detectar localização da empresa → formato do papel:
   - EUA/Canadá → `letter`
   - Resto do mundo → `a4`
6. Detectar arquétipo do cargo → adaptar framing
7. Reescrever Professional Summary injetando keywords da JD + exit narrative bridge ("Construiu e vendeu um negócio. Agora aplicando pensamento sistêmico para [domínio da JD].")
8. Selecionar top 3-4 projetos mais relevantes para a vaga
9. Reordenar bullets de experiência por relevância à JD
10. Construir competency grid desde requisitos da JD (6-8 keyword phrases)
11. Injetar keywords naturalmente em conquistas existentes (NUNCA inventar)
12. Gerar HTML completo desde template + conteúdo personalizado
13. Ler `name` de `config/profile.yml` → normalizar para kebab-case lowercase (ex: "John Doe" → "john-doe") → `{candidate}`
14. Escrever HTML em `/tmp/cv-{candidate}-{company}.html`
15. Executar: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
15. Reportar: ruta del PDF, nº páginas, % cobertura de keywords

## Regras ATS (parsing limpo)

- Layout single-column (sem sidebars, sem colunas paralelas)
- Headers padrão: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- Sem texto em imagens/SVGs
- Sem info crítica em headers/footers do PDF (ATS os ignora)
- UTF-8, texto selecionável (não rasterizado)
- Sem tabelas aninhadas
- Keywords da JD distribuídas: Summary (top 5), primeiro bullet de cada cargo, Skills section

## Design do PDF

- **Fonts**: Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- **Fonts self-hosted**: `fonts/`
- **Header**: nome em Space Grotesk 24px bold + linha gradiente `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + fila de contacto
- **Section headers**: Space Grotesk 13px, uppercase, letter-spacing 0.05em, color cyan primary
- **Body**: DM Sans 11px, line-height 1.5
- **Company names**: color accent purple `hsl(270,70%,45%)`
- **Márgens**: 0.6in
- **Background**: branco puro

## Orden de seções (otimizado "6-second recruiter scan")

1. Header (nome grande, gradiente, contacto, link portfolio)
2. Professional Summary (3-4 linhas, keyword-dense)
3. Core Competencies (6-8 keyword phrases em flex-grid)
4. Work Experience (cronológico inverso)
5. Projects (top 3-4 mais relevantes)
6. Education & Certifications
7. Skills (idiomas + técnicos)

## Estratégia de keyword injection (ético, baseado em verdade)

Exemplos de reformulação legítima:
- JD diz "RAG pipelines" e CV diz "LLM workflows with retrieval" → mudar para "RAG pipeline design and LLM orchestration workflows"
- JD diz "MLOps" e CV diz "observability, evals, error handling" → mudar para "MLOps and observability: evals, error handling, cost monitoring"
- JD diz "stakeholder management" e CV diz "collaborated with team" → mudar para "stakeholder management across engineering, operations, and business"

**NUNCA añadir skills que o candidato não tem. Solo reformular experiência real com o vocabulário exato da JD.**

## Template HTML

Usar o template em `cv-template.html`. Substituir os placeholders `{{...}}` com conteúdo personalizado:

| Placeholder | Conteúdo |
|-------------|-----------|
| `{{LANG}}` | `en` ou `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) ou `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{PHONE}}` | (from profile.yml — include with its separator only when `profile.yml` has a non-empty `phone` value; omit both `<span>` and `<span class="separator">` otherwise) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` | [from profile.yml] |
| `{{LINKEDIN_DISPLAY}}` | [from profile.yml] |
| `{{PORTFOLIO_URL}}` | [from profile.yml] (ou /es segundo idioma) |
| `{{PORTFOLIO_DISPLAY}}` | [from profile.yml] (ou /es segundo idioma) |
| `{{LOCATION}}` | [from profile.yml] |
| `{{SECTION_SUMMARY}}` | Professional Summary / Resumo Profissional |
| `{{SUMMARY_TEXT}}` | Summary personalizado com keywords |
| `{{SECTION_COMPETENCIES}}` | Core Competencies / Competências Core |
| `{{COMPETENCIES}}` | `<span class="competency-tag">keyword</span>` × 6-8 |
| `{{SECTION_EXPERIENCE}}` | Work Experience / Experiência Profissional |
| `{{EXPERIENCE}}` | HTML de cada trabalho com bullets reordenados |
| `{{SECTION_PROJECTS}}` | Projects / Projetos |
| `{{PROJECTS}}` | HTML de top 3-4 projetos |
| `{{SECTION_EDUCATION}}` | Education / Formação |
| `{{EDUCATION}}` | HTML de educação |
| `{{SECTION_CERTIFICATIONS}}` | Certifications / Certificações |
| `{{CERTIFICATIONS}}` | HTML de certificações |
| `{{SECTION_SKILLS}}` | Skills / Competências |
| `{{SKILLS}}` | HTML de skills |

## Canva CV Generation (optional)

Se `config/profile.yml` tiver `canva_resume_design_id` definido, oferecer ao usuário uma escolha antes de gerar:
- **"HTML/PDF (rápido, ATS-otimizado)"** — fluxo existente acima
- **"Canva CV (visual, design-preserving)"** — novo fluxo abaixo

Se o usuário não tiver `canva_resume_design_id`, pular este prompt e usar o fluxo HTML/PDF.

### Fluxo Canva

#### Step 1 — Duplicar o design base

a. `export-design` o design base (usando `canva_resume_design_id`) como PDF → obter download URL
b. `import-design-from-url` usando essa download URL → cria um novo design editável (o duplicado)
c. Anotar o novo `design_id` para o duplicado

#### Step 2 — Ler a estrutura do design

a. `get-design-content` no novo design → retorna todos os elementos de texto (richtexts) com seu conteúdo
b. Mapear elementos de texto para seções do CV por correspondência de conteúdo:
   - Procurar pelo nome do candidato → seção header
   - Procurar por "Summary" ou "Professional Summary" → seção summary
   - Procurar por nomes de empresas de cv.md → seções de experiência
   - Procurar por nome de grau/escola → seção educação
   - Procurar por keywords de skills → seção skills
c. Se o mapeamento falhar, mostrar ao usuário o que foi encontrado e pedir orientação

#### Step 3 — Gerar conteúdo customizado

Mesmo geração de conteúdo do fluxo HTML (Steps 1-11 acima):
- Reescrever Professional Summary com keywords da JD + exit narrative
- Reordenar bullets de experiência por relevância à JD
- Selecionar top competencies dos requisitos da JD
- Injetar keywords naturalmente (NUNCA inventar)

**IMPORTANTE — Regra de orçamento de caracteres:** Cada texto de substituição DEVE ter aproximadamente o mesmo comprimento que o texto original que substitui (dentro de ±15% do número de caracteres). Se o conteúdo customizado for mais longo, condensá-lo. O design do Canva tem caixas de texto de tamanho fixo — texto mais longo causa sobreposição com elementos adjacentes. Contar os caracteres em cada elemento original do Step 2 e impor este orçamento ao gerar substituições.

#### Step 4 — Aplicar edições

a. `start-editing-transaction` no design duplicado
b. `perform-editing-operations` com `find_and_replace_text` para cada seção:
   - Substituir texto do summary com summary customizado
   - Substituir cada bullet de experiência com bullets reordenados/reescritos
   - Substituir texto de competency/skills com termos que correspondam à JD
   - Substituir descrições de projetos com top projetos relevantes
c. **Reflow do layout após substituição de texto:**
   Após aplicar todas as substituições de texto, as caixas de texto se redimensionam automaticamente mas os elementos vizinhos permanecem no lugar. Isso causa espaçamento desigual entre as seções de experiência de trabalho. Corrigir isso:
   1. Ler as posições e dimensões dos elementos atualizados da resposta `perform-editing-operations`
   2. Para cada seção de experiência de trabalho (de cima para baixo), calcular onde a caixa de texto dos bullets termina: `end_y = top + height`
   3. O header da próxima seção deve começar em `end_y + consistent_gap` (usar o gap original do template, tipicamente ~30px)
   4. Usar `position_element` para mover o header da próxima seção, data, nome da empresa, título do cargo e elementos de bullets para manter espaçamento uniforme
   5. Repetir para todas as seções de experiência de trabalho
d. **Verificar layout antes do commit:**
   - `get-design-thumbnail` com o transaction_id e page_index=1
   - Inspecionar visualmente o thumbnail para: texto sobreposto, espaçamento desigual, texto cortado, texto muito pequeno
   - Se problemas persistirem, ajustar com `position_element`, `resize_element`, ou `format_text`
   - Repetir até o layout estar limpo
d. Mostrar ao usuário o preview final e pedir aprovação
e. `commit-editing-transaction` para salvar (SOMENTE após aprovação do usuário)

#### Step 5 — Exportar e baixar PDF

a. `export-design` o duplicado como PDF (format: a4 ou letter baseado na localização da JD)
b. **IMEDIATAMENTE** baixar o PDF usando Bash:
   ```bash
   curl -sL -o "output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf" "{download_url}"
   ```
   A URL de exportação é um link pré-assinado S3 que expira em ~2 horas. Baixe imediatamente.
c. Verificar o download:
   ```bash
   file output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf
   ```
   Deve mostrar "PDF document". Se mostrar XML ou HTML, a URL expirou — reexportar e tentar novamente.
d. Reportar: caminho do PDF, tamanho do arquivo, URL do design Canva (para ajuste manual)

#### Tratamento de erros

- Se `import-design-from-url` falhar → voltar para o pipeline HTML/PDF com mensagem
- Se elementos de texto não puderem ser mapeados → avisar usuário, mostrar o que foi encontrado, pedir mapeamento manual
- Se `find_and_replace_text` não encontrar correspondências → tentar correspondência de substring mais ampla
- Sempre fornecer a URL do design Canva para o usuário poder editar manualmente se a auto-edição falhar

## Pós-geração

Atualizar tracker se a vaga já estiver registrada: mudar PDF de ❌ para ✅.
