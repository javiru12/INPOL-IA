# Qué hay que verificar antes de cargar un padrón externo

Este documento no dice «no se puede». Dice qué tiene que estar
acreditado para que se pueda, y dónde cada fuente se atora.

El consentimiento de cada persona **no es la única base legal**. Un
sujeto obligado puede tratar datos sin consentimiento cuando una ley se
lo faculta (LGPDPPSO art. 22). Lo que no se puede saltar es el
**principio de finalidad**: el dato recogido para un fin no se puede
reutilizar para otro incompatible (art. 18). Casi todo se decide ahí.

## Las seis preguntas

**1. ¿Quién es el responsable del tratamiento?**
No es lo mismo una dependencia de gobierno (sujeto obligado, le aplica
la LGPDPPSO) que un partido, una campaña o un proveedor. Si INPOL opera
para una dependencia, el responsable es la dependencia y el proveedor es
encargado: hace falta el contrato de encargo por escrito.

**2. ¿Cuál es la finalidad declarada, y es compatible con aquella para
la que se recogió el dato?**
Esta es la que decide. El padrón del IMSS se formó para administrar la
seguridad social. Usarlo para ubicar y segmentar electores es otra
finalidad, y no una compatible. Para **gestión social** —atender una
petición ciudadana ya presentada— el argumento es más defendible que
para **targeting electoral**, que es donde se cae.

**3. ¿Qué instrumento traslada los datos?**
Entre sujetos obligados, la transferencia exige que el receptor tenga
una atribución relacionada y que exista instrumento formal (LGPDPPSO
art. 66-70). Pide el convenio y revisa que cite la facultad concreta,
no una genérica.

**4. ¿Hay aviso de privacidad que cubra este tratamiento y esta fuente?**
Tiene que estar antes del tratamiento, no después, y nombrar la fuente
cuando el dato no se obtuvo de la persona.

**5. ¿Se hizo la evaluación de impacto?**
La LGPDPPSO (art. 74) la exige para tratamientos intensivos o
relevantes. Cruzar varios padrones por CURP sobre millones de personas
lo es sin discusión.

**6. ¿Cómo se ejercen los derechos ARCO sobre estos datos?**
Si alguien pide acceso o cancelación de lo que el sistema sabe de él,
tiene que haber por dónde. Hoy el cruce es consultable por CURP, que es
la mitad; falta el procedimiento.

## Dónde se atora cada fuente

| Fuente | Situación |
|---|---|
| **Cartografía INE** (secciones, distritos, municipios) | Catálogo público. Sin problema, ya está cargada. |
| **Resultados electorales por sección** | Públicos y agregados. Sin problema. |
| **SUA / IMSS agregado por región** | Un promedio salarial por distrito no identifica a nadie. Viable; es la forma en que está pedido en la lista. |
| **SUA / IMSS nominal** (nombre, CURP, NSS, salario) | Se atora en la pregunta 2. Finalidad incompatible, y la transferencia necesitaría una atribución que el IMSS pueda citar. |
| **Buró de crédito** | No hay camino por facultad pública. La LRSIC (art. 28) exige autorización expresa del titular y limita el uso a evaluar crédito; no tiene excepción para sujetos obligados. |
| **Padrones de programas sociales (Bienestar)** | Su uso con fines electorales está tipificado como delito (Ley General en Materia de Delitos Electorales, art. 11). Para gestión social sin fin electoral habría que separarlo con mucho cuidado. |
| **Padrón electoral nominal** | Confidencial por LGIPE art. 126; su uso indebido está tipificado en el art. 13 de la ley de delitos electorales. |

## Cómo queda el sistema mientras tanto

- El esquema está completo y es el definitivo: `db/migrations/22-fuentes-externas.sql`.
- Las tablas llevan `tenant_id` y RLS forzado, así que lo que cargue un
  cliente no lo ve otro.
- Cada fila guarda `fuente` y `cargado_en`. Un dato personal sin
  procedencia no se puede defender.
- `db/seed-fuentes-externas.mts` genera datos sintéticos con la misma
  forma. El cruce, el indicador de zona discrepante y las pantallas
  funcionan igual.
- `db/importar-sua.mts` lee la estructura real del archivo y exige
  `--base-legal` para cargar registros reales. Lo declarado queda en
  bitácora.

El día que exista el instrumento, se corre el importador con su
referencia y no se toca una línea de pantalla.
