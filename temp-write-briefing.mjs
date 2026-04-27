import fs from 'fs';

const content = `# Análise de Vaga — Axon / LATAM Business Controller

## Snapshot
- **Empresa:** Axon (NASDAQ: AXON) — Tecnologia de segurança pública (TASER, body cameras, drones, AI)
- **Título oficial:** LATAM Business Controller
- **Nível:** Sênior / Head (IC inicial com scope de build-out completo)
- **Modalidade:** Presencial — São Paulo, Brasil
- **Faixa salarial:** Não mencionada
- **Stack/área:** Controllership LATAM, US GAAP, Brazil GAAP, Tax (ICMS/PIS/COFINS), Greenfield entity setup, SOX, SEC reporting

## Dor do negócio (por que esta vaga existe)

Axon está expandindo para o Brasil via criação de nova entidade legal do zero (greenfield). A empresa é uma US public company (NASDAQ: AXON) com rigor de SOX/SEC reporting e precisa de alguém que implemente toda a estrutura de accounting, controles e sistemas para subsidiária brasileira, enquanto suporta crescimento acelerado.

Esta não é uma vaga de manutenção. É uma vaga de build-out. A JD deixa explícito: "solely focused on standing up a legal entity in Brazil", "supporting high growth", "implemented IT systems", "establishing the accounting systems and process for the entity". [explícito]

O recrutador busca alguém que já tenha feito isso antes — preferencialmente um Big4 alum que transitou para corporate accounting de multinacional americana, com experiência em subsidiária brasileira de US public company. O diferencial é ter vivenciado o setup completo de entidade: desde opening balance, implementação de ERP, configuração de tax local (ICMS/PIS/COFINS), até integração com reporting corporate (10-Q/K). [implícito]

A vaga é IC inicial ("start off as an individual contributor") mas scope é de liderança completa — cross-functional com tax, legal, sales, procurement, IT, operations. Isso sugere que a empresa quer alguém hands-on nos primeiros 12-18 meses para implementar tudo, com potencial para escalar para gestão de equipe após a entidade estar operacional. [hipótese]

Sinais de "greenfield build-out" na JD:
- "standing up a legal entity in Brazil" [explícito]
- "implemented IT systems" [explícito]
- "establishing the accounting systems and process for the entity" [explícito]
- "accounting systems and ERP setups" [explícito]
- "support from a PMO perspective working cross functionally" [explícito]

## Perfil arquetípico buscado

Big4 alum (5-8 anos) que transitou para corporate accounting de subsidiária brasileira de multinacional americana (NASDAQ-listed), com 10+ anos de experiência total. Tem SOX/SEC reporting (10-Q/K) no DNA, Brazil GAAP profundamente (ICMS/PIS/COFINS/transfer pricing), e já liderou ou participou ativamente de greenfield entity setup. É fluente em português e inglês, comfortable conversando com US headquarters sobre GAAP differences (US vs BR) enquanto negocia com tax authorities locais. Hands-on nos primeiros 2 anos (IC) mas com leadership skills para cross-functional stakeholder management. CRC/CPA ativo é selo de credibilidade.

## Requisitos must-have

- 10+ anos de experiência progressiva em audit/accounting [explícito]
- Experiência em multinacional empresa pública americana (US public company), suportando processo 10-Q/K [explícito] — OBRIGATÓRIO
- Strong technical US GAAP knowledge [explícito]
- Strong understanding of Brazil GAAP [explícito]
- Transfer pricing e local reporting requirements para hardware distributor [explícito]
- Experiência com ICMS, PIS/COFINS e outros impostos locais [explícito]
- Fluência em português e inglês (verbal e written) [explícito]
- Comfortable working directly with local tax authorities and auditors [explícito]
- Experiência em implementação de IT systems / ERP [explícito]
- SOX controls e contract review para revenue recognition [explícito]

## Requisitos nice-to-have

- CPA or Chartered Accountant — "strongly preferred" (não obrigatório mas é grande diferencial) [explícito]
- Experiência em D365, Blackline e/ou ferramentas de consolidação [explícito]
- Experiência em treasury / hedging program [explícito]
- Background em hardware distributor [explícito]

## Top 5 keywords prioritárias (P0)

| # | Keyword | Categoria | Frequência JD |
|---|---------|-----------|---------------|
| 1 | US GAAP | hard skill | 3× (explicit + 10-Q/K + GAAP to STAT) |
| 2 | Brazil GAAP | hard skill | 2× (explicit + local reporting) |
| 3 | SOX / SEC reporting | hard skill | 2× (SOX controls + 10-Q/K) |
| 4 | Entity setup / greenfield | industry/knowledge | 4× (standing up entity + implemented systems + establishing processes + ERP setup) |
| 5 | ICMS / PIS / COFINS | hard skill | 2× (explicit + tax team support) |

## Score estimado de fit

**FIT: 4.2/5.0**

**Justificativa:**
- Match forte: US GAAP + SEC reporting (AgroFresh NYSE-listed), Brazil GAAP, Transfer pricing, ICMS/PIS/COFINS (Brazilian Tax Reform Committee), SOX controls, monthly close, cross-functional stakeholder management. Candidato atende todos os requisitos must-have técnicos.
- Diferencial único: "Integrated Accounting Intelligence" com Microsoft + GPT é prova concreta de systems implementation mindset — compensa gap de greenfield entity setup. M&A integration 3x (build from acquisition zero) é equivalente funcional a greenfield setup.
- Gap principal: Não há greenfield entity setup documentado. Mas M&A integration + IFRS implementation (3, 9, 15, 16, 17) + systems automation são compensadores fortes.
- Certificação: CRC ativo + ACCA Cert IFR é strong match para "CPA strongly preferred". Recrutador americano pode não conhecer CRC, mas explicação como "Brazil CPA equivalent" resolve.
- Idioma: C2 English (EF SET) + C1 Spanish + Native Portuguese — supera requisito de fluência.
- Localização: São Paulo — match perfeito com requisito presencial.

**Recomendação:** VALE A PENA APLICAR. Vaga é altamente alinhada com perfil do candidato. O único gap real (greenfield entity setup) é compensável com M&A integration experience + systems implementation track record. Candidato deve framing M&A como "build from acquisition zero" para evidenciar ability de construir operações do zero.
`;

fs.writeFileSync('D:/Career Ops/output/tailor-runs/2026-04-27-axon-latam-business-controller/01-vaga-briefing.md', content, 'utf8');
console.log('Briefing salvo com sucesso!');
