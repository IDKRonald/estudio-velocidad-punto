(function () {
  "use strict";

  // ---------- Documento de campo (Imprimir / PDF) ----------
  // Reproduce la estructura exacta del formato en papel: dos tablas de tres
  // columnas (Auto particular/Motocicletas/Taxis individuales y Buses
  // colectivos/Carga liviana/Carga pesada), solo con el tiempo de recorrido.
  // La velocidad no va aqui: es un dato derivado que pertenece al analisis
  // en Excel, no a la planilla de campo.

  function buildGroupTable(session, categories) {
    var byCat = {};
    categories.forEach(function (c) { byCat[c] = []; });
    session.lecturas.forEach(function (r) {
      if (byCat[r.categoria]) byCat[r.categoria].push(r);
    });
    var maxRows = 0;
    categories.forEach(function (c) { maxRows = Math.max(maxRows, byCat[c].length); });

    var html = "<table><thead>";
    html += "<tr><th>No. Lectura</th><th colspan='" + categories.length + "'>Tiempo de recorrido</th></tr>";
    html += "<tr><th></th>";
    categories.forEach(function (c) { html += "<th>" + VP.CATEGORY_LABELS[c] + "</th>"; });
    html += "</tr></thead><tbody>";
    for (var i = 0; i < maxRows; i++) {
      html += "<tr><td>" + (i + 1) + "</td>";
      categories.forEach(function (c) {
        var r = byCat[c][i];
        html += "<td>" + (r ? r.tiempo.toFixed(2) : "") + "</td>";
      });
      html += "</tr>";
    }
    if (maxRows === 0) {
      html += "<tr><td colspan='" + (categories.length + 1) + "'>Sin lecturas registradas</td></tr>";
    }
    html += "</tbody></table>";
    return html;
  }

  VP.buildPrintHtml = function (session) {
    var html = "";
    html += "<h2>UNIVERSIDAD NACIONAL DE COLOMBIA – FACULTAD DE MINAS</h2>";
    html += "<h2>INGENIERIA DE TRANSITO – ESTUDIO DE VELOCIDAD PUNTO</h2>";
    html += "<div class='print-fields'>";
    html += "<span>Fecha: " + (session.fecha || "___") + "</span>";
    html += "<span>Equipo: " + (session.equipo || "___") + "</span>";
    html += "<span>Localizacion: " + session.localizacion + "</span>";
    html += "<span>Sentido: " + (session.sentido || "___") + "</span><br>";
    html += "<span>Hora Inicio: " + (session.horaInicio || "___") + "</span>";
    html += "<span>Hora Fin: " + (session.horaFin || "___") + "</span>";
    html += "<span>Longitud del tramo: " + session.longitud + " m</span>";
    html += "</div>";
    VP.PRINT_GROUPS.forEach(function (group) {
      html += buildGroupTable(session, group);
    });
    return html;
  };

  // ---------- Libro de Excel (analisis estadistico) ----------

  function sheetRef(label, cellAddr) {
    return "'" + label + "'!" + cellAddr;
  }

  function styleHeaderRow(row) {
    row.eachCell(function (cell) {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  }

  // Construye la hoja de una categoria: tabla N/Tiempo/Velocidad, Media y
  // Desviacion (DESVEST.M), tabla de la curva normal (DISTR.NORM.N cada
  // 2 km/h), imagen de la curva, y el tamano de muestra minimo al 95%.
  // Devuelve metadata de celdas para que la hoja Resumen pueda referenciarlas.
  function buildCategorySheet(workbook, session, categoria) {
    var label = VP.CATEGORY_LABELS[categoria];
    var records = session.lecturas.filter(function (r) { return r.categoria === categoria; });
    var ws = workbook.addWorksheet(label);
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 16;
    ws.getColumn(5).width = 24;
    ws.getColumn(6).width = 14;

    ws.mergeCells("A1:C1");
    ws.getCell("A1").value = "ESTUDIO DE VELOCIDAD PUNTO – " + label;
    ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };

    ws.mergeCells("A2:C2");
    ws.getCell("A2").value =
      "Fecha: " + (session.fecha || "-") + "   Localizacion: " + session.localizacion +
      "   Sentido: " + (session.sentido || "-") + "   Tramo: " + session.longitud + " m";
    ws.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF5F6B7A" } };

    var headerRow = 4;
    ws.getRow(headerRow).values = ["N°", "Tiempo [s]", "Velocidad [km/h]"];
    styleHeaderRow(ws.getRow(headerRow));

    var firstDataRow = headerRow + 1;
    records.forEach(function (r, idx) {
      var row = ws.getRow(firstDataRow + idx);
      row.values = [idx + 1, r.tiempo, r.velocidad];
      row.getCell(2).numFmt = "0.00";
      row.getCell(3).numFmt = "0.0";
    });
    var lastDataRow = firstDataRow + Math.max(records.length, 1) - 1;
    var velRange = "C" + firstDataRow + ":C" + lastDataRow;

    var meta = { label: label, count: records.length, sheetName: label };

    if (records.length < 2) {
      var msgRow = lastDataRow + 2;
      ws.mergeCells("A" + msgRow + ":C" + msgRow);
      ws.getCell("A" + msgRow).value =
        "Lecturas insuficientes (" + records.length + "). Se necesitan al menos 2 para calcular media, desviacion y la curva normal.";
      ws.getCell("A" + msgRow).font = { italic: true, color: { argb: "FFD9534F" } };
      meta.mediaRef = null;
      meta.desviacionRef = null;
      return meta;
    }

    var statsRow = lastDataRow + 2;
    ws.getCell("A" + statsRow).value = "Media [km/h]";
    ws.getCell("A" + statsRow).font = { bold: true };
    ws.getCell("B" + statsRow).value = { formula: "AVERAGE(" + velRange + ")" };
    ws.getCell("B" + statsRow).numFmt = "0.00";

    var sdRow = statsRow + 1;
    ws.getCell("A" + sdRow).value = "Desviacion [km/h]";
    ws.getCell("A" + sdRow).font = { bold: true };
    ws.getCell("B" + sdRow).value = { formula: "STDEV.S(" + velRange + ")" };
    ws.getCell("B" + sdRow).numFmt = "0.000";

    var mediaAddr = "B" + statsRow;
    var desviacionAddr = "B" + sdRow;

    // Tabla de la curva normal, velocidad cada 2 km/h (DISTR.NORM.N)
    var speeds = records.map(function (r) { return r.velocidad; });
    var m = VP.mean(speeds);
    var sd = VP.sampleStdDev(speeds);
    var pts = VP.curvePoints(m, sd, 2);

    var curveHeaderRow = sdRow + 2;
    ws.getRow(curveHeaderRow).values = ["Velocidad [km/h]", "f(v)"];
    styleHeaderRow(ws.getRow(curveHeaderRow));
    pts.forEach(function (p, idx) {
      var row = ws.getRow(curveHeaderRow + 1 + idx);
      row.getCell(1).value = p.x;
      row.getCell(2).value = { formula: "NORM.DIST(A" + (curveHeaderRow + 1 + idx) + "," + mediaAddr + "," + desviacionAddr + ",FALSE)" };
      row.getCell(2).numFmt = "0.0000";
    });

    // Tamano de muestra minimo (95%, E = 1 km/h)
    var sampleRow = curveHeaderRow;
    ws.getCell("E" + sampleRow).value = "Z (95%)";
    ws.getCell("F" + sampleRow).value = 1.96;
    ws.getCell("E" + (sampleRow + 1)).value = "Sigma (desviacion)";
    ws.getCell("F" + (sampleRow + 1)).value = { formula: desviacionAddr };
    ws.getCell("F" + (sampleRow + 1)).numFmt = "0.000";
    ws.getCell("E" + (sampleRow + 2)).value = "E permitido [km/h]";
    ws.getCell("F" + (sampleRow + 2)).value = 1;
    ws.getCell("E" + (sampleRow + 3)).value = "n minimo requerido";
    ws.getCell("E" + (sampleRow + 3)).font = { bold: true };
    ws.getCell("F" + (sampleRow + 3)).value = {
      formula: "ROUNDUP((F" + sampleRow + "^2*F" + (sampleRow + 1) + "^2)/F" + (sampleRow + 2) + "^2,0)"
    };
    ws.getCell("E" + (sampleRow + 4)).value = "n lecturas realizadas";
    ws.getCell("F" + (sampleRow + 4)).value = { formula: "COUNT(" + velRange + ")" };
    ws.getCell("E" + (sampleRow + 5)).value = "¿Cumple muestra minima?";
    ws.getCell("E" + (sampleRow + 5)).font = { bold: true };
    ws.getCell("F" + (sampleRow + 5)).value = {
      formula: "IF(F" + (sampleRow + 4) + ">=F" + (sampleRow + 3) + ",\"Si\",\"No\")"
    };

    meta.mediaRef = mediaAddr;
    meta.desviacionRef = desviacionAddr;
    meta.nMinRef = "F" + (sampleRow + 3);
    meta.nRealRef = "F" + (sampleRow + 4);
    meta.cumpleRef = "F" + (sampleRow + 5);

    // Imagen de la curva, debajo del bloque de tamano de muestra
    var canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 260;
    VP.drawNormalCurve(canvas.getContext("2d"), canvas.width, canvas.height, {
      mean: m, sd: sd, title: "Distribucion de Velocidades - " + label
    });
    var dataUrl = canvas.toDataURL("image/png");
    var imgId = workbook.addImage({ base64: dataUrl, extension: "png" });
    ws.addImage(imgId, { tl: { col: 4, row: sampleRow + 6 }, ext: { width: 420, height: 228 } });

    return meta;
  }

  function buildSummarySheet(workbook, session, metas) {
    var ws = workbook.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.getColumn(1).width = 20;
    for (var c = 2; c <= 6; c++) ws.getColumn(c).width = 16;

    ws.mergeCells("A1:F1");
    ws.getCell("A1").value = "ESTUDIO DE VELOCIDAD PUNTO – Resumen";
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };

    ws.mergeCells("A2:F2");
    ws.getCell("A2").value =
      "Fecha: " + (session.fecha || "-") + "   Equipo: " + (session.equipo || "-") +
      "   Localizacion: " + session.localizacion + "   Sentido: " + (session.sentido || "-") +
      "   Hora inicio: " + (session.horaInicio || "-") + "   Hora fin: " + (session.horaFin || "-") +
      "   Longitud del tramo: " + session.longitud + " m";
    ws.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF5F6B7A" } };

    var headerRow = 4;
    ws.getRow(headerRow).values = [
      "Categoria", "Lecturas", "Media [km/h]", "Desviacion [km/h]", "n minimo (95%)", "¿Cumple?"
    ];
    styleHeaderRow(ws.getRow(headerRow));

    metas.forEach(function (meta, idx) {
      var row = ws.getRow(headerRow + 1 + idx);
      row.getCell(1).value = meta.label;
      row.getCell(2).value = meta.count;
      if (meta.mediaRef) {
        row.getCell(3).value = { formula: sheetRef(meta.sheetName, meta.mediaRef) };
        row.getCell(3).numFmt = "0.00";
        row.getCell(4).value = { formula: sheetRef(meta.sheetName, meta.desviacionRef) };
        row.getCell(4).numFmt = "0.000";
        row.getCell(5).value = { formula: sheetRef(meta.sheetName, meta.nMinRef) };
        row.getCell(6).value = { formula: sheetRef(meta.sheetName, meta.cumpleRef) };
      } else {
        row.getCell(3).value = "-";
        row.getCell(4).value = "-";
        row.getCell(5).value = "-";
        row.getCell(6).value = "Insuficiente";
      }
    });
  }

  VP.buildWorkbook = async function (session) {
    var workbook = new ExcelJS.Workbook();
    workbook.creator = "Estudio de Velocidad Punto";
    workbook.created = new Date();

    var metas = VP.CATEGORIES.map(function (cat) {
      return buildCategorySheet(workbook, session, cat);
    });
    buildSummarySheet(workbook, session, metas);
    workbook.views = [{ activeTab: 0 }];

    return workbook;
  };

  VP.downloadWorkbook = async function (session) {
    var workbook = await VP.buildWorkbook(session);
    var buffer = await workbook.xlsx.writeBuffer();
    var blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "estudio_velocidad_" + (session.fecha || "sesion") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---------- Compartir lecturas entre dispositivos (.json) ----------
  // Formato propio de la app, pensado para repartir el trabajo de campo:
  // cada companero mide algunas categorias y exporta su .json; al
  // importarlo en otro telefono, las lecturas se combinan (VP.mergeLecturas)
  // sin perder lo que ya habia ahi.

  VP.downloadSessionJson = function (session) {
    var payload = {
      formato: "estudio-velocidad-punto",
      version: 1,
      exportadoEn: new Date().toISOString(),
      session: session
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var equipo = (session.equipo || "equipo").trim().replace(/\s+/g, "-");
    a.href = url;
    a.download = "lecturas_" + (session.fecha || "sesion") + "_" + equipo + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  VP.downloadVolumenSessionJson = function (session) {
    var payload = {
      formato: "estudio-volumen-vehicular",
      version: 1,
      exportadoEn: new Date().toISOString(),
      session: session
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var equipo = (session.equipo || "equipo").trim().replace(/\s+/g, "-");
    a.href = url;
    a.download = "aforos_" + (session.fecha || "sesion") + "_" + equipo + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
})();
