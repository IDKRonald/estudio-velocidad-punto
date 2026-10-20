# Estudio de Volumen Vehicular — Captura (fase 1)

Status: approved by user in chat (2026-10-20), pending spec file review.

## Contexto y alcance

La app "Estudio de Velocidad Punto" (PWA en producción en
https://idkronald.github.io/estudio-velocidad-punto/) hoy solo soporta
un tipo de práctica: velocidad puntual por cronómetro. Se agrega un
segundo tipo de práctica, basado en "Guia_Practica_Volumen_Vehicular.pdf":
conteo de volumen vehicular en una glorieta, discriminado por movimiento
(12 posibles: 4 entradas, 4 internos, 4 salidas) y categoría de vehículo,
acumulado en intervalos de 15 minutos.

Las dos prácticas son metodológicamente distintas (deliverables, campos
de sesión y análisis estadístico distintos), así que se tratan como dos
**tipos de estudio independientes**, elegidos en una pantalla de entrada
nueva, cada uno con su propia clave de localStorage.

**Esta fase (1) cubre solo captura, corrección y consolidación entre
dispositivos.** Lo que exige la guía para el análisis — factores de
equivalencia, VHMD (Volumen Horario de Máxima Demanda), FHP (Factor de
Hora Pico), gráfico de barras apiladas por movimiento, Excel/PDF del
estudio de volumen — es la fase 2, con su propio spec después. No se
implementa en esta fase.

## Decisiones ya confirmadas con el usuario

1. Dos tipos de estudio separados (Velocidad / Volumen), no un único
   modelo de sesión compartido.
2. Un estudio de Volumen contiene VARIOS aforos (uno por movimiento
   contado), igual que un estudio de Velocidad contiene varias lecturas
   de distintas categorías. Esto permite que el dashboard/export final
   vea varios movimientos juntos, y que el export/import JSON ya
   existente sirva para consolidar movimientos medidos por compañeros
   distintos.
3. La pantalla de conteo muestra las 6 categorías simultáneamente (no
   "una categoría a la vez" como el cronómetro), porque los vehículos de
   categorías distintas pasan sin aviso y hay que poder tocar cualquiera
   en el momento.

## Modelo de datos

Nueva clave de localStorage: `velpunto_volumen_session_v1` (independiente
de `velpunto_session_v1`, que sigue siendo exclusiva del estudio de
Velocidad y no se toca).

```js
volumenSession = {
  fecha: "2026-10-20",
  equipo: "Grupo 3",
  ubicacion: "Glorieta Av 80 con Av Colombia",
  aforos: [
    {
      id: "<timestamp>_<random>",   // mismo esquema que lecturas.id hoy
      movimiento: "X1",             // "X1".."X4" (entrada), "Y1".."Y4" (interno), "Z1".."Z4" (salida)
      inicioMs: 1792519179479,      // epoch ms, para calcular el intervalo actual
      horaInicio: "14:07:32",       // string de display, derivado de inicioMs
      horaFin: "15:22:10" | null,   // null mientras el aforo sigue activo
      intervalos: [
        {
          inicio: "14:07:32",       // HH:MM:SS de display
          fin: "14:22:32",
          counts: {
            Particular: 12, Moto: 30, Taxi: 5,
            Bus: 2, "Carga liviana": 1, "Carga pesada": 0
          }
        }
        // ...un elemento por cada intervalo de 15 min transcurrido
      ]
    }
    // ...un elemento por cada aforo (movimiento) que el estudio contiene
  ]
}
```

No hay campos "sentido" ni "longitud del tramo" (no aplican a conteo).

### Las 12 etiquetas de movimiento

Agrupadas por acceso (1-4), cada uno con Entrada/Interno/Salida, igual
que la Ilustración 1 de la guía (verde=entrada, azul=interno, rojo=salida):

| Acceso | Entrada | Interno | Salida |
|---|---|---|---|
| 1 | Entrada 1 (X₁) | Interno 1 (Y₁) | Salida 1 (Z₁) |
| 2 | Entrada 2 (X₂) | Interno 2 (Y₂) | Salida 2 (Z₂) |
| 3 | Entrada 3 (X₃) | Interno 3 (Y₃) | Salida 3 (Z₃) |
| 4 | Entrada 4 (X₄) | Interno 4 (Y₄) | Salida 4 (Z₄) |

Clave interna: `"X1".."X4"`, `"Y1".."Y4"`, `"Z1".."Z4"` (coincide con la
notación de la guía, para que el export/Excel de la fase 2 pueda
reusarla sin traducir).

## Navegación de alto nivel

Nueva pantalla de entrada (`view-studytype`), antes de cualquier otra
vista: "¿Qué estudio vas a hacer?" con dos botones, Velocidad y Volumen.

- `js/app.js` (existente) deja de auto-ejecutar `buildCategoryGrid();
  initSessionView();` al cargar. Esas dos líneas se mueven a una función
  expuesta `VP.app.init()`, invocada solo cuando el usuario elige
  Velocidad. El resto de `app.js` no cambia.
- El registro del service worker y la lógica del banner de instalación
  (al final de `app.js`) siguen corriendo siempre, sin importar el tipo
  de estudio elegido — no dependen de ninguna vista.
- Nuevo archivo `js/volumen.js`, mismo patrón que `app.js` pero para el
  flujo de Volumen, expone `VP.volumen.init()`.
- Nuevo archivo pequeño (o unas líneas en `index.html`) que maneja
  `view-studytype`: al elegir un tipo, oculta esa vista y llama al
  `init()` correspondiente. Un ícono en la barra superior de cada flujo
  permite volver a `view-studytype` para cambiar de tipo de estudio.

## Pantallas nuevas (flujo Volumen)

1. **Datos del estudio** — Fecha, Equipo, Ubicación. Igual de simple que
   hoy pero sin Sentido/Longitud del tramo.
2. **Elegir movimiento** — grilla de 12 botones (agrupados visualmente
   por acceso 1-4), igual de estilo que la grilla de categorías de hoy.
   Cada toque crea un aforo **nuevo e independiente** (`inicioMs =
   Date.now()`), aunque ya exista otro aforo previo para ese mismo
   movimiento — no hay "reanudar" un aforo finalizado. Si alguien
   retoma el conteo de un movimiento tras una pausa, eso genera un
   segundo aforo separado para ese movimiento en el mismo estudio (la
   fase 2, al analizar VHMD/FHP, deberá poder sumar varios aforos del
   mismo movimiento si hace falta). Se eligió esto por simplicidad: la
   alternativa — decidir si reanudar un aforo rellena con ceros el
   tiempo que la app estuvo cerrada o continúa desde "ahora" — no tiene
   una respuesta obviamente correcta y no vale la pena resolverla en
   esta fase.
3. **Conteo** (la pantalla central) — las 6 categorías como tarjetas,
   cada una con:
   - Nombre de la categoría
   - Conteo del intervalo **actual** (grande)
   - Botón "+1" (grande, para el pulgar)
   - Botón "-1" pequeño, para deshacer toques accidentales (no baja de 0)
   Arriba: "Intervalo actual: 14:07 - 14:22", recalculado cada segundo
   a partir de `inicioMs` (no depende de que seguir con la app abierta
   sin cerrarla; si se reabre más tarde, recalcula el intervalo correcto
   según el reloj, y los intervalos intermedios sin conteo quedan en 0 —
   aceptable, dado que nadie estaba contando en ese lapso).
   Botón "Finalizar aforo": marca `horaFin`, guarda el intervalo parcial
   tal cual esté, y vuelve a "Elegir movimiento" (se puede encadenar otro
   aforo, mismo u otro movimiento, en el mismo estudio).
4. **Ver conteos** — selector de aforo (si hay más de uno) + tabla:
   filas = intervalos, columnas = las 6 categorías, celdas editables
   tocando el número (corrección manual, sin modal). Botón "Eliminar
   aforo" para descartar uno completo. Esto reemplaza el modal de
   edición por-registro del modo Velocidad: acá la unidad de dato es
   "cantidad por categoría por intervalo", no un evento individual.
5. **Exportar / Importar JSON** — mismo mecanismo que ya existe para
   Velocidad (`VP.mergeLecturas` tiene su equivalente aquí: combinar
   `aforos` por `id`, mismo criterio de "reimportar no duplica"), para
   que el equipo junte movimientos medidos por celulares distintos.

## Mecánica del intervalo (detalle de implementación)

```js
function currentIntervalIndex(aforo) {
  return Math.floor((Date.now() - aforo.inicioMs) / (15 * 60 * 1000));
}
```

Un `setInterval` de 1s en la pantalla de conteo:
- Recalcula el índice de intervalo actual.
- Si el índice avanzó respecto al último renderizado, empuja un nuevo
  objeto de intervalo vacío a `aforo.intervalos` (contadores en 0) y
  refresca la UI para mostrar el intervalo nuevo.
- Si no avanzó, solo actualiza el reloj mostrado (no hace falta volver
  a pintar los contadores).

Cada tap de "+1"/"-1" escribe directamente en
`aforo.intervalos[currentIntervalIndex(aforo)].counts[categoria]` y
guarda a localStorage de inmediato (mismo patrón que `saveSession()` en
`app.js` hoy).

## Fuera de alcance (fase 2, spec aparte)

- Factores de equivalencia (Tabla 1 de la guía).
- Cálculo de VHMD (suma de franjas horarias de 4 intervalos).
- Cálculo de FHP por movimiento.
- Gráfico de barras apiladas por movimiento (Ilustración 6).
- Export a Excel/PDF específico del estudio de Volumen.
- Dashboard de Volumen (hoy el dashboard solo existe para Velocidad).

## Testing

Mismo enfoque que el resto del proyecto: Chrome headless real vía
Playwright, no solo lectura de código. Casos a cubrir:
- Selector de tipo de estudio enruta correctamente y no rompe el flujo
  de Velocidad existente (regresión).
- Avance automático de intervalo: en vez de esperar 15 minutos reales,
  el test manipula `aforo.inicioMs` hacia el pasado (vía localStorage)
  para simular tiempo transcurrido y verifica que el intervalo mostrado
  y el array `intervalos` avancen correctamente.
- +1/-1 no baja de 0, persiste tras recargar la página.
- Multi-aforo: dos aforos de movimientos distintos en el mismo estudio,
  ambos visibles en "Ver conteos".
- Edición manual de una celda en "Ver conteos" persiste correctamente.
- Export/import JSON entre dos "dispositivos" (contextos de navegador
  separados) combina aforos de movimientos distintos sin duplicar al
  reimportar el mismo archivo dos veces.
- Sin errores de consola en ningún escenario.
