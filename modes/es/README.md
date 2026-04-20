# career-ops -- Modos en español (`modes/es/`)

Este directorio contiene las traducciones al español (rioplatense, con perspectiva argentina) de los principales modos de career-ops para candidatos que cumplen objetivos en el mercado hispanohablante, **especialmente Argentina**.

## ¿Cuándo usar estos modos?

Usá `modes/es/` si al menos una de estas condiciones se cumple:

- Postulás principalmente a **ofertas de empleo en español** (sitios de carrera de empresas argentinas, regionales o hispanohablantes, LinkedIn ES, Glassdoor LATAM, Bumerán, Computrabajo)
- Tu **CV es en español** o alternás entre ES e EN según la ofre
- Necesitás respuestas y cartas de presentación en **español tech natural**, no traducidas por máquina
- Tenés que manejar **especificidades contractuales del mercado argentino**: relación de dependencia, descuento jubilatorio, aportes AFJP/SIPA, vacaciones, licencias, jornada laboral, convenio colectivo, modalidad de trabajo, indemnización por despido, SAC (Salario Anual Complementario)

Si la mayoría de tus ofertas son en inglés, quedate con los modos estándar en `modes/`. Los modos en inglés funcionan para ofertas hispanohablantes, pero no conocen los detalles del mercado argentino.

## ¿Cómo activar?

### Opción 1 -- Por sesión

Decile a Claude al principio de la sesión:

> "Usá los modos en español bajo `modes/es/`."

Claude va a leer los archivos de ese directorio en lugar de `modes/`.

### Opción 2 -- Permanentemente

Agregá en `config/profile.yml`:

```yaml
language:
  primary: es
  modes_dir: modes/es
```

Recordale a Claude en tu primera sesión ("Mirá en `profile.yml`, configuré `language.modes_dir`"). Claude va a usar automáticamente los modos en español.

## ¿Qué modos están traducidos?

Esta primera iteración cubre los cuatro modos con mayor impacto:

| Archivo | Traducido desde | Función |
|---------|-----------------|---------|
| `_shared.md` | `modes/_shared.md` (EN) | Contexto compartido, arquetipos, reglas globales, especificidades del mercado argentino |
| `oferta.md` | `modes/oferta.md` (ES original) | Evaluación completa de una oferta (Bloques A-G) |
| `aplicar.md` | `modes/apply.md` (EN) | Asistente en vivo para rellenar formularios de candidatura |
| `pipeline.md` | `modes/pipeline.md` (ES original) | Inbox de URLs / Segunda mente para ofertas recolectadas |

Los otros modos (`scan`, `batch`, `pdf`, `tracker`, `auto-pipeline`, `deep`, `contacto`, `ofertas`, `project`, `training`, `patterns`, `followup`) siguen en EN/ES. Su contenido es principalmente tooling, rutas y comandos -- tiene que mantenerse independiente del idioma. Si necesitás alguno en español, pedíselo directamente al agente.

## Caveat: `modes/oferta.md` en la raíz

Por razones históricas, existe `modes/oferta.md` en la raíz del proyecto (fue el archivo original con sesgo al español). Ese archivo es **una versión anterior y parcial**. La versión completa y actualizada está en `modes/es/oferta.md`. 

**Usá `modes/es/` configurando `language.modes_dir`** como se describe arriba. No mezcles los dos.

## Portales argentinos

Para escanear ofertas de empresas argentinas y regionales, hay un archivo de ejemplo con keywords optimizados para el mercado:

```bash
# En la raíz del proyecto:
cp templates/portals.ar.example.yml portals.yml
```

Ese archivo ya tiene empresas, keywords y regiones para Argentina. Ajustalo según tus preferencias de roles y ciudades.

## ¿Qué sigue siendo en inglés?

Intencionalmente no traducido porque es vocabulario técnico estándar:

- Nombres de herramientas (`Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Bash`)
- Términos de estatus en el tracker (`Evaluated`, `Applied`, `Interview`, `Offer`, `Rejected`)
- Fragmentos de código, rutas, comandos
- Conceptos de scoring (`Score`, `Archetype`, `Proof Point`)

Los modos usan español tech natural, como se habla en equipos de ingeniería en Buenos Aires, Córdoba o Rosario: texto corriente en español, términos técnicos en inglés donde es el uso. Sin traducciones forzadas de "Pipeline" a "Canalización" ni de "Deploy" a "Despliegue aplicativo".

## Lexicografía de referencia

Para mantener un tono coherente si modificás o extendés los modos:

| Inglés | Español (en esta codebase) |
|--------|---------------------------|
| Job posting | Oferta / Aviso / Publicación |
| Application | Candidatura / Postulación |
| Cover letter | Carta de presentación / Presentación |
| Resume / CV | CV |
| Salary | Salario / Remuneración |
| Compensation | Remuneración / Paquete |
| Skills | Competencias / Habilidades |
| Interview | Entrevista / Ronda |
| Hiring manager | Hiring manager / Gerente de selección |
| Recruiter | Recruiter / Reclutador |
| AI | IA (Inteligencia Artificial) |
| Requirements | Requisitos / Exigencias |
| Career history | Trayectoria profesional |
| Probation | Período de prueba / Contrato a prueba |
| Vacation | Licencias / Vacaciones |
| Salary component | Componente salarial |
| Permanent employment | Relación de dependencia / Contrato indefinido |
| Fixed-term contract | Contrato por tiempo determinado |
| Freelance | Freelance / Independiente / Monotributo |
| Collective agreement | Convenio colectivo |
| Union | Sindicato |
| Works council | Comisión interna / Delegado gremial |
| Profit sharing | Participación de ganancias / Bonus |
| Meal vouchers | Viáticos / Almuerzo |
| Health insurance | Cobertura médica / Prepaga |
| Severance pay | Indemnización por despido |
| Annual bonus | SAC (Salario Anual Complementario) / 13º mes |
| Notice period | Período de preaviso |
| Retirement contributions | Aportes jubilatorios / AFJP / SIPA |
| Remote work | Trabajo remoto / Modalidad híbrida |

## Guía para otras regiones hispanohablantes

Si tu mercado objetivo es México, Chile, Colombia, Uruguay o Perú: copiá `modes/es/` a `modes/es-mx/`, `modes/es-cl/`, etc., según corresponda. Luego:

1. En `_shared.md`, reemplazá la sección "Mercado argentino" con especificidades locales:
   - **México:** ISR, IMSS, INFONAVIT, prima de antigüedad, PTU (Participación de Trabajadores en las Ganancias), aguinaldo
   - **Chile:** AFP, isapre, CTS (Cesantía), bono de desempeño, gratificación, descuento de salud
   - **Colombia:** ARL, EPS, fondos de pensión, prima de servicios, prima de Navidad, auxilio de transporte
   - **Uruguay:** BPS, fondo de desempleo, régimen de jornada laboral, comisión interna, afiliación sindical
   - **Perú:** SPP, AFP, EPS, gratificación, CTS, prima de desempeño, bonificación extraordinaria

2. Ajustá el léxico según el uso local (voseo/tuteo/ustedeo, regionalismos técnicos).

3. Copiá `templates/portals.ar.example.yml` y adaptalo con empresas y keywords de tu región.

4. Abrí una Issue en GitHub con la propuesta, y considerá contribuir el nuevo directorio regional a `main` (ver `CONTRIBUTING.md`).

## Contribuir

Para mejorar una traducción o agregar un modo:

1. Abrí una Issue con tu propuesta (ver `CONTRIBUTING.md`)
2. Respetá el léxico arriba para mantener tono coherente
3. Traducí de manera idiomática -- sin traducciones palabra por palabra
4. Conservá los elementos estructurales (Bloques A-G, tablas, bloques de código, instrucciones de herramientas) idénticos
5. Testeá con una verdadera oferta hispanohablante (LinkedIn ES, Bumerán, sitio de carrera de empresa argentina) antes de enviar la PR

Recordá: `config/profile.yml` y `modes/_profile.md` es donde va tu personalización. No edites `modes/es/_shared.md` para contenido específico del usuario -- eso asegura que las actualizaciones del sistema no sobrescriban tus customizaciones.
