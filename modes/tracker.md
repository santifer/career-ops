# Modo: tracker — Tracker de Aplicações

Lê e mostra `data/applications.md`.

**Formato do tracker:**
```markdown
| # | Data | Empresa | Cargo | Score | Estado | PDF | Report |
```

Estados possíveis: `Avaliada` → `Aplicada` → `Respondida` → `Contato` → `Entrevista` → `Oferta` / `Rejeitada` / `Descartada` / `NÃO APLICAR`

- `Aplicada` = o candidato enviou sua candidatura
- `Respondida` = Um recruiter/empresa contatou e o candidato respondeu (inbound)
- `Contato` = O candidato contatou proativamente alguém da empresa (outbound, ex: LinkedIn power move)

Se o usuário pedir para atualizar um estado, editar a fila correspondente.

Mostrar também estatísticas:
- Total de aplicações
- Por estado
- Score médio
- % com PDF gerado
- % com report gerado
