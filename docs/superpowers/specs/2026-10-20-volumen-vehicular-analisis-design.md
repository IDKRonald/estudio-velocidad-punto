# Volumen Vehicular — Análisis (fase 2) — Diseño

## Objetivo

Que un grupo, después de juntar en un teléfono los aforos de todos (con
el import JSON de la fase 1), obtenga en el app el análisis que pide
"Guia_Practica_Volumen_Vehicular.pdf": volúmenes equivalentes, VHMD de la
glorieta, FHP y gráfico de barras apiladas por movimiento, y un Excel
"Cálculos_Volumen_GrupoX" con las memorias de cálculo.

## Decisiones confirmadas con el usuario

1. **Fuente de datos:** solo los aforos que hay en el app (propios +
   importados por JSON). No se importa la Google Sheet.
2. **Emparejamiento de intervalos:** por número de intervalo (intervalo 1
   de cada aforo con intervalo 1 de los demás), sin mirar la hora del
   reloj. La hora de inicio de cada aforo se muestra para que el desfase
   sea visible.
3. **Salida:** pantalla "Análisis" + export Excel. Gráficos descargables
   como PNG. Sin PDF.
4. **Base del VHMD:** selector Entradas (X, por defecto) / Salidas (Z).
   Nunca internos (Y), según la guía.
5. **Varios aforos del mismo movimiento:** el usuario elige con casillas
   qué aforos entran; los marcados del mismo movimiento se suman
   intervalo por intervalo.

## Cálculos (`js/analisis.js`, funciones puras)

- `VP.FACTORES_EQUIVALENCIA` (Tabla 1): Particular 1, Taxi 1, Moto 0.5,
  Bus 2, Carga liviana 2, Carga pesada 3.
- `VP.analisis.combinarPorMovimiento(aforos)` → `{ [movKey]: intervalos[] }`
  donde `intervalos[i].counts[cat]` es la suma de los aforos de ese
  movimiento en el índice `i`. Longitud = la del aforo más largo de ese
  movimiento.
- `VP.analisis.equivalente(counts)` → suma de `counts[cat] × factor`.
- `VP.analisis.calcularVHMD(combinado, base)`: para cada índice `i`, total
  equivalente = suma de los 4 movimientos de la base (`X1..X4` o
  `Z1..Z4`) que tengan datos; un movimiento sin intervalo `i` aporta 0.
  Número de intervalos = el máximo entre los movimientos de la base.
  Franjas = ventanas de 4 intervalos consecutivos `[i, i+3]`; VHMD = la de
  mayor suma (en empate, la primera). Devuelve
  `{ totales[], franjas[{inicio, suma}], vhmd: {inicio, suma} | null,
  movimientosFaltantes[] }`. `vhmd` es `null` si hay menos de 4 intervalos.
- `VP.analisis.calcularFHP(intervalos, inicio)`: volúmenes equivalentes de
  los intervalos `inicio..inicio+3` (los que falten = 0);
  `FHP = suma / (4 × máximo)`, redondeado a 3 decimales; `null` si el
  máximo es 0. Ejemplo de la guía: 527 / (4 × 135) = 0.976.

## Pantalla "Análisis"

Se abre con un botón nuevo en el selector de movimientos; botón "Volver".
Contenido, en orden:

1. Casillas, una por aforo: "Movimiento (hora inicio)", todas marcadas
   al entrar. Cambiar una recalcula todo.
2. Selector Entradas / Salidas.
3. Tabla de franjas: intervalo, total equivalente, suma de franja; fila
   del VHMD resaltada. Avisos: movimientos de la base sin datos; "Se
   necesitan al menos 4 intervalos" si `vhmd` es `null` (y no se muestran
   FHP ni gráficos).
4. Tabla FHP: los 12 movimientos, FHP o "sin datos". Aviso si un
   movimiento tiene menos de 4 intervalos dentro de la ventana VHMD.
5. 12 gráficos (Chart.js, barras apiladas): eje X = los 4 intervalos del
   VHMD ("Intervalo 1..4"), series = las 6 categorías en volumen
   equivalente. Botón "Descargar PNG" por gráfico. Movimientos sin datos:
   sin gráfico.
6. Botón "Exportar Excel": pide el número de grupo (`prompt`) y descarga
   `Calculos_Volumen_Grupo<N>.xlsx`.

## Excel (ExcelJS, con fórmulas)

- **Factores:** tabla de factores (las demás hojas los referencian).
- **Mixtos:** por movimiento con datos, filas = intervalos, columnas =
  6 categorías + total (fórmula SUM).
- **Equivalentes:** misma forma; cada celda = fórmula `Mixtos!celda ×
  Factores!factor`; total con SUM.
- **VHMD:** base usada; por intervalo, total = SUM de las celdas total de
  los movimientos de la base en Equivalentes; columna suma de franja
  (SUM de 4 filas); celda VHMD = MAX; fila del VHMD resaltada.
- **FHP:** por movimiento, volumen de la hora (SUM), mayor intervalo
  (MAX), FHP = `ROUND(vol / (4 × max), 3)`.

Los valores calculados por las fórmulas deben coincidir con los de la
pantalla (los scripts lo verifican escribiendo también el valor cacheado
como `result`).

## Fuera de alcance

PDF del informe, import de la Google Sheet, emparejamiento por hora del
reloj, edición de factores.

## Pruebas

Script Playwright ad-hoc (patrón del proyecto) que siembra en
localStorage aforos con valores conocidos y verifica: combinación de
aforos del mismo movimiento, VHMD con base X y Z, FHP (incluido un caso
que da 0.976), casillas que excluyen un aforo, avisos de faltantes y de
menos de 4 intervalos, 12/N gráficos renderizados, y el Excel descargado
(leído con ExcelJS en Node: hojas, fórmulas y valores). Luego la
regresión completa (16 scripts), cero errores de consola. Al final:
bump de `CACHE_NAME`, `analisis.js` en `ASSETS`, push y verificación en
el sitio en vivo.
