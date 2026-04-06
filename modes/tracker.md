# Modo: tracker — Tracker de Aplicaciones

Lee y muestra `data/applications.md`.

**Formato del tracker:**
```markdown
| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |
```

**Estados canónicos:** `Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`

Usar siempre los labels de `templates/states.yml` en `applications.md`.
Las variantes en español (`Evaluada`, `Aplicado`, `Respondido`, etc.) solo cuentan como aliases de entrada; el estado persistido debe quedar canónico.

- `Applied` = el candidato envió su candidatura
- `Responded` = la empresa respondió, pero aún no está en entrevista
- `Interview` = proceso de entrevistas activo
- `Offer` = oferta recibida
- `Rejected` = rechazo de la empresa
- `Discarded` = el candidato descarta la oferta o la vacante se cierra
- `SKIP` = no merece aplicar

`Contacto` no es un estado canónico. Si hubo outreach manual (ej. LinkedIn power move), guardarlo en la columna de notas.

Si el usuario pide actualizar un estado, editar la fila correspondiente.

Mostrar también estadísticas:
- Total de aplicaciones
- Por estado
- Score promedio
- % con PDF generado
- % con report generado
