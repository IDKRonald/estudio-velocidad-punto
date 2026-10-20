(function () {
  "use strict";

  // Tabla 1 de la guia (Guia_Practica_Volumen_Vehicular.pdf).
  VP.FACTORES_EQUIVALENCIA = {
    "Particular": 1,
    "Taxi": 1,
    "Moto": 0.5,
    "Bus": 2,
    "Carga liviana": 2,
    "Carga pesada": 3
  };

  var BASES = {
    X: ["X1", "X2", "X3", "X4"],
    Z: ["Z1", "Z2", "Z3", "Z4"]
  };

  // ---------- Calculos (funciones puras) ----------

  // Suma, intervalo por intervalo (emparejados por numero, no por hora),
  // los aforos del mismo movimiento.
  function combinarPorMovimiento(aforos) {
    var out = {};
    aforos.forEach(function (a) {
      var list = out[a.movimiento] || (out[a.movimiento] = []);
      a.intervalos.forEach(function (interval, i) {
        if (!list[i]) {
          var counts = {};
          VP.CATEGORIES.forEach(function (c) { counts[c] = 0; });
          list[i] = { counts: counts };
        }
        VP.CATEGORIES.forEach(function (c) { list[i].counts[c] += interval.counts[c] || 0; });
      });
    });
    return out;
  }

  function equivalente(counts) {
    return VP.CATEGORIES.reduce(function (s, c) {
      return s + (counts[c] || 0) * VP.FACTORES_EQUIVALENCIA[c];
    }, 0);
  }

  function calcularVHMD(combinado, base) {
    var movs = BASES[base];
    var presentes = movs.filter(function (m) { return combinado[m] && combinado[m].length; });
    var n = presentes.reduce(function (mx, m) { return Math.max(mx, combinado[m].length); }, 0);
    var totales = [];
    for (var i = 0; i < n; i++) {
      totales.push(presentes.reduce(function (s, m) {
        var iv = combinado[m][i];
        return s + (iv ? equivalente(iv.counts) : 0);
      }, 0));
    }
    var franjas = [];
    for (var j = 0; j + 3 < n; j++) {
      franjas.push({ inicio: j, suma: totales[j] + totales[j + 1] + totales[j + 2] + totales[j + 3] });
    }
    var vhmd = null;
    franjas.forEach(function (f) { if (!vhmd || f.suma > vhmd.suma) vhmd = f; });
    return {
      totales: totales,
      franjas: franjas,
      vhmd: vhmd,
      movimientosFaltantes: movs.filter(function (m) { return presentes.indexOf(m) === -1; })
    };
  }

  function volumenesVentana(intervalos, inicio) {
    var vols = [];
    for (var k = inicio; k < inicio + 4; k++) {
      vols.push(intervalos[k] ? equivalente(intervalos[k].counts) : 0);
    }
    return vols;
  }

  function calcularFHP(intervalos, inicio) {
    var vols = volumenesVentana(intervalos, inicio);
    var max = Math.max.apply(null, vols);
    if (max === 0) return null;
    var suma = vols.reduce(function (s, v) { return s + v; }, 0);
    return Math.round(suma / (4 * max) * 1000) / 1000;
  }

  VP.analisis = {
    combinarPorMovimiento: combinarPorMovimiento,
    equivalente: equivalente,
    calcularVHMD: calcularVHMD,
    calcularFHP: calcularFHP
  };

  // ---------- Pantalla ----------

  var CAT_COLORS = ["#2d5080", "#e8a33d", "#3a9d6a", "#c0504d", "#8064a2", "#4bacc6"];
  var excluidos = {}; // aforo.id -> true si se desmarco
  var base = "X";
  var charts = [];

  function movLabel(key) {
    var m = VP.MOVIMIENTOS.filter(function (x) { return x.key === key; })[0];
    return m ? m.label : key;
  }

  function aforosElegidos() {
    return VP.volumen.getSession().aforos.filter(function (a) { return !excluidos[a.id]; });
  }

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function renderCasillas() {
    var box = document.getElementById("analisisAforos");
    box.innerHTML = "";
    VP.volumen.getSession().aforos.forEach(function (a) {
      var label = el("label", null, "check-row");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !excluidos[a.id];
      cb.dataset.aforoId = a.id;
      cb.addEventListener("change", function () {
        if (cb.checked) delete excluidos[a.id]; else excluidos[a.id] = true;
        renderResultados();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + movLabel(a.movimiento) + " (" + a.horaInicio + ")"));
      box.appendChild(label);
    });
  }

  function renderResultados() {
    charts.forEach(function (c) { c.destroy(); });
    charts = [];
    var out = document.getElementById("analisisResultados");
    out.innerHTML = "";

    var combinado = combinarPorMovimiento(aforosElegidos());
    var r = calcularVHMD(combinado, base);

    if (r.movimientosFaltantes.length) {
      out.appendChild(el("p", "Sin datos para: " + r.movimientosFaltantes.map(movLabel).join(", ") +
        ". El VHMD se calcula con los movimientos disponibles.", "analisis-warn"));
    }
    if (!r.vhmd) {
      out.appendChild(el("p", "Se necesitan al menos 4 intervalos de 15 minutos para calcular el VHMD.", "analisis-warn"));
      return;
    }

    // Franjas horarias
    out.appendChild(el("h3", "VHMD de la glorieta (" + (base === "X" ? "entradas" : "salidas") + ")"));
    var wrap = el("div", null, "table-wrap");
    var t = document.createElement("table");
    t.id = "vhmdTable";
    t.innerHTML = "<thead><tr><th>Intervalo</th><th>Total equivalente</th><th>Suma franja (1 h)</th></tr></thead>";
    var tb = document.createElement("tbody");
    r.totales.forEach(function (tot, i) {
      var tr = document.createElement("tr");
      if (i === r.vhmd.inicio) tr.className = "vhmd-row";
      var f = r.franjas[i];
      tr.appendChild(el("td", String(i + 1)));
      tr.appendChild(el("td", String(tot)));
      tr.appendChild(el("td", f ? String(f.suma) : ""));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    out.appendChild(wrap);
    out.appendChild(el("p", "VHMD: intervalos " + (r.vhmd.inicio + 1) + " a " + (r.vhmd.inicio + 4) +
      " = " + r.vhmd.suma + " veh. equivalentes", "muted"));

    // FHP por movimiento
    out.appendChild(el("h3", "FHP por movimiento"));
    var ft = document.createElement("table");
    ft.id = "fhpTable";
    ft.innerHTML = "<thead><tr><th>Movimiento</th><th>FHP</th></tr></thead>";
    var ftb = document.createElement("tbody");
    var cortos = [];
    VP.MOVIMIENTOS.forEach(function (m) {
      var ivs = combinado[m.key];
      var tr = document.createElement("tr");
      tr.dataset.mov = m.key;
      tr.appendChild(el("td", m.label));
      if (!ivs) {
        tr.appendChild(el("td", "sin datos"));
      } else {
        var fhp = calcularFHP(ivs, r.vhmd.inicio);
        tr.appendChild(el("td", fhp == null ? "sin datos" : fhp.toFixed(3)));
        if (ivs.length < r.vhmd.inicio + 4) cortos.push(m.label);
      }
      ftb.appendChild(tr);
    });
    ft.appendChild(ftb);
    var fwrap = el("div", null, "table-wrap");
    fwrap.appendChild(ft);
    out.appendChild(fwrap);
    if (cortos.length) {
      out.appendChild(el("p", "Con menos de 4 intervalos en la franja del VHMD (los faltantes cuentan como 0): " +
        cortos.join(", "), "analisis-warn"));
    }

    // Graficos
    out.appendChild(el("h3", "Volumen por intervalo en el VHMD"));
    VP.MOVIMIENTOS.forEach(function (m) {
      var ivs = combinado[m.key];
      if (!ivs) return;
      var card = el("div", null, "analisis-chart");
      card.appendChild(el("p", m.label, "chart-title"));
      var box = el("div", null, "chart-box");
      var canvas = document.createElement("canvas");
      canvas.dataset.mov = m.key;
      box.appendChild(canvas);
      card.appendChild(box);
      var btn = el("button", "Descargar PNG", "btn btn-ghost");
      btn.type = "button";
      card.appendChild(btn);
      out.appendChild(card);

      var labels = [], ventana = [];
      for (var k = r.vhmd.inicio; k < r.vhmd.inicio + 4; k++) {
        labels.push("Intervalo " + (k + 1));
        ventana.push(ivs[k]);
      }
      var chart = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: VP.CATEGORIES.map(function (c, ci) {
            return {
              label: c,
              backgroundColor: CAT_COLORS[ci],
              data: ventana.map(function (iv) { return iv ? iv.counts[c] * VP.FACTORES_EQUIVALENCIA[c] : 0; })
            };
          })
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true, title: { display: true, text: "Veh. equivalentes" } }
          }
        }
      });
      charts.push(chart);
      btn.addEventListener("click", function () {
        var a = document.createElement("a");
        a.href = chart.toBase64Image("image/png", 1);
        a.download = "grafico_" + m.key + ".png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });
  }

  function goToAnalisis() {
    var ids = VP.volumen.getSession().aforos.map(function (a) { return a.id; });
    Object.keys(excluidos).forEach(function (id) { if (ids.indexOf(id) === -1) delete excluidos[id]; });
    document.getElementById("analisisBase").value = base;
    renderCasillas();
    VP.volumen.showView("view-volumen-analisis");
    renderResultados();
  }

  document.getElementById("btnGoAnalisis").addEventListener("click", goToAnalisis);
  document.getElementById("btnAnalisisBack").addEventListener("click", function () { VP.volumen.back(); });
  document.getElementById("analisisBase").addEventListener("change", function (e) {
    base = e.target.value;
    renderResultados();
  });
  document.getElementById("btnExportAnalisisExcel").addEventListener("click", async function () {
    var grupo = prompt("Numero de grupo:", VP.volumen.getSession().equipo || "");
    if (grupo === null) return;
    var wb = buildAnalisisWorkbook(aforosElegidos(), base);
    var buffer = await wb.xlsx.writeBuffer();
    var blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "Calculos_Volumen_Grupo" + grupo.trim().replace(/[^\w-]+/g, "_") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ---------- Excel (memorias de calculo con formulas) ----------

  function col(i) { return String.fromCharCode(65 + i); } // 0 -> A

  function bold(row) { row.eachCell(function (c) { c.font = { bold: true }; }); }

  function buildAnalisisWorkbook(aforos, base) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "Estudio de Velocidad Punto";
    wb.created = new Date();
    var combinado = combinarPorMovimiento(aforos);
    var r = calcularVHMD(combinado, base);
    var nCat = VP.CATEGORIES.length;
    var totalCol = col(nCat + 1); // A = intervalo, B.. = categorias, luego Total

    var wsF = wb.addWorksheet("Factores");
    bold(wsF.addRow(["Categoria", "Factor de equivalencia"]));
    VP.CATEGORIES.forEach(function (c) { wsF.addRow([c, VP.FACTORES_EQUIVALENCIA[c]]); });
    wsF.getColumn(1).width = 18;

    // Mixtos y Equivalentes comparten exactamente la misma disposicion de celdas.
    var wsM = wb.addWorksheet("Mixtos");
    var wsE = wb.addWorksheet("Equivalentes");
    var filas = {}; // movKey -> { start, n }
    var row = 1;
    VP.MOVIMIENTOS.forEach(function (m) {
      var ivs = combinado[m.key];
      if (!ivs) return;
      [wsM, wsE].forEach(function (ws) {
        ws.getCell("A" + row).value = m.label;
        ws.getCell("A" + row).font = { bold: true };
        ws.getRow(row + 1).values = ["Intervalo"].concat(VP.CATEGORIES, ["Total"]);
        bold(ws.getRow(row + 1));
      });
      var start = row + 2;
      ivs.forEach(function (iv, i) {
        var rr = start + i;
        wsM.getCell("A" + rr).value = i + 1;
        wsE.getCell("A" + rr).value = i + 1;
        var totM = 0, totE = 0;
        VP.CATEGORIES.forEach(function (c, ci) {
          var addr = col(ci + 1) + rr;
          var v = iv.counts[c];
          var ve = v * VP.FACTORES_EQUIVALENCIA[c];
          totM += v; totE += ve;
          wsM.getCell(addr).value = v;
          wsE.getCell(addr).value = { formula: "Mixtos!" + addr + "*Factores!$B$" + (ci + 2), result: ve };
        });
        var sumF = "SUM(B" + rr + ":" + col(nCat) + rr + ")";
        wsM.getCell(totalCol + rr).value = { formula: sumF, result: totM };
        wsE.getCell(totalCol + rr).value = { formula: sumF, result: totE };
      });
      filas[m.key] = { start: start, n: ivs.length };
      row = start + ivs.length + 1;
    });

    var wsV = wb.addWorksheet("VHMD");
    wsV.getCell("A1").value = "Base: " + (base === "X" ? "entradas (X)" : "salidas (Z)");
    wsV.getRow(2).values = ["Intervalo", "Total equivalente", "Suma franja (1 h)"];
    bold(wsV.getRow(2));
    r.totales.forEach(function (tot, i) {
      var rr = 3 + i;
      var refs = BASES[base].filter(function (mk) { return filas[mk] && i < filas[mk].n; })
        .map(function (mk) { return "Equivalentes!" + totalCol + (filas[mk].start + i); });
      wsV.getCell("A" + rr).value = i + 1;
      wsV.getCell("B" + rr).value = refs.length ? { formula: refs.join("+"), result: tot } : 0;
      if (r.franjas[i]) {
        wsV.getCell("C" + rr).value = { formula: "SUM(B" + rr + ":B" + (rr + 3) + ")", result: r.franjas[i].suma };
      }
    });
    if (r.vhmd) {
      var lastFr = 3 + r.franjas.length - 1;
      var vr = 3 + r.totales.length + 1;
      wsV.getCell("A" + vr).value = "VHMD";
      wsV.getCell("A" + vr).font = { bold: true };
      wsV.getCell("C" + vr).value = { formula: "MAX(C3:C" + lastFr + ")", result: r.vhmd.suma };
      wsV.getCell("D" + vr).value = "Intervalos " + (r.vhmd.inicio + 1) + " a " + (r.vhmd.inicio + 4);
      wsV.getRow(3 + r.vhmd.inicio).eachCell(function (c) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      });

      var wsP = wb.addWorksheet("FHP");
      wsP.addRow(["Movimiento", "Intervalos", "Volumen hora", "Mayor intervalo", "FHP"]);
      bold(wsP.getRow(1));
      VP.MOVIMIENTOS.forEach(function (m) {
        var f = filas[m.key];
        if (!f) return;
        var vols = volumenesVentana(combinado[m.key], r.vhmd.inicio);
        var suma = vols.reduce(function (s, v) { return s + v; }, 0);
        var max = Math.max.apply(null, vols);
        var fhp = calcularFHP(combinado[m.key], r.vhmd.inicio);
        var rr = wsP.rowCount + 1;
        wsP.getCell("A" + rr).value = m.label;
        wsP.getCell("B" + rr).value = (r.vhmd.inicio + 1) + " a " + (r.vhmd.inicio + 4);
        var last = Math.min(r.vhmd.inicio + 3, f.n - 1);
        if (r.vhmd.inicio <= last) {
          var range = "Equivalentes!" + totalCol + (f.start + r.vhmd.inicio) + ":" + totalCol + (f.start + last);
          wsP.getCell("C" + rr).value = { formula: "SUM(" + range + ")", result: suma };
          wsP.getCell("D" + rr).value = { formula: "MAX(" + range + ")", result: max };
        } else {
          wsP.getCell("C" + rr).value = 0;
          wsP.getCell("D" + rr).value = 0;
        }
        wsP.getCell("E" + rr).value = {
          formula: "IF(D" + rr + "=0,\"\",ROUND(C" + rr + "/(4*D" + rr + "),3))",
          result: fhp == null ? "" : fhp
        };
      });
      wsP.getColumn(1).width = 18;
    }
    return wb;
  }

  VP.analisis.buildAnalisisWorkbook = buildAnalisisWorkbook;
})();
