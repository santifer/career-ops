# Modo: tracker — Tracker de Aplicaciones

Lee y muestra `data/applications.md`.

**Formato del tracker:**
```markdown
| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |
```

Estados posibles (canonical, per `templates/states.yml`):

`Evaluated` → `Applied` → `Contacted` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = the candidate submitted their application
- `Contacted` = the candidate proactively reached out to someone at the company (outbound, e.g., LinkedIn power move via `/career-ops contacto`)
- `Responded` = a recruiter/company contacted back and the candidate responded (inbound)

Si el usuario pide actualizar un estado, editar la fila correspondiente.

Mostrar también estadísticas:
- Total de aplicaciones
- Por estado
- Score promedio
- % con PDF generado
- % con report generado
