# Modo: tracker — Tracker de Aplicaciones

Lee `data/applications.json` (preferido) o `data/applications.md` (deprecated).

**Formato JSON del tracker:**
```json
{
  "version": "1.0",
  "applications": [
    {
      "number": 1,
      "date": "2026-03-12",
      "company": "Acme Corp",
      "role": "Senior Engineer",
      "status": "Applied",
      "score": 4.5,
      "scoreRaw": "4.5/5",
      "hasPdf": true,
      "reportPath": "reports/001.md",
      "reportNumber": "001",
      "notes": "Strong match"
    }
  ]
}
```

**Estados canonicos (ingles, sensibles a mayusculas):**
`Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

Alias soportados (se normalizan automaticamente):
- `Aplicado`, `aplicado`, `enviada`, `aplicada`, `sent` → `Applied`
- `Respondido` → `Responded`
- `Entrevista` → `Interview`
- `Rechazada`, `rechazado` → `Rejected`
- `Descartada`, `cerrada`, `cancelada`, `duplicado` → `Discarded`
- `NO APLICAR`, `skip`, `geo blocker` → `SKIP`

**Legacy (deprecated):** Si el archivo JSON no existe, cae back a `applications.md` en formato markdown:
```markdown
| # | Fecha | Empresa | Rol | Score | Status | PDF | Report | Notas |
|---|-------|---------|-----|-------|--------|-----|--------|-------|
```

Si el usuario pide actualizar un estado, editar el archivo JSON directamente.

Mostrar también estadísticas:
- Total de aplicaciones
- Por estado
- Score promedio
- % con PDF generado
- % con report generado
