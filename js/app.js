(function () {
  "use strict";

  var STORAGE_KEY = "velpunto_session_v1";
  var CATEGORIES = VP.CATEGORIES;

  /** @type {{fecha:string, equipo:string, localizacion:string, sentido:string,
   *          longitud:number, horaInicio:string|null, horaFin:string|null,
   *          lecturas:Array<Object>}|null} */
  var session = null;

  var pending = { categoria: null, distancia: null };

  var sw = {
    running: false,
    startTs: 0,
    elapsedMs: 0,
    rafId: null
  };

  var editingId = null;
  var dashboardCharts = [];

  // ---------- Persistence ----------

  function loadSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      alert("No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado).");
    }
  }

  // ---------- View routing ----------

  function showView(id) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === id);
    });
    var navMenu = document.getElementById("btnMenuNav");
    var navRecords = document.getElementById("btnRecordsNav");
    var navDashboard = document.getElementById("btnDashboardNav");
    var showNav = id !== "view-session";
    navMenu.hidden = !showNav;
    navRecords.hidden = !showNav;
    navDashboard.hidden = !showNav;
  }

  // ---------- Session view ----------

  function fmtDateInput(d) {
    return d.toISOString().slice(0, 10);
  }

  function initSessionView() {
    var existing = loadSession();
    if (existing) {
      session = existing;
      document.getElementById("f-fecha").value = session.fecha;
      document.getElementById("f-equipo").value = session.equipo || "";
      document.getElementById("f-localizacion").value = session.localizacion;
      document.getElementById("f-sentido").value = session.sentido || "";
      document.getElementById("f-longitud").value = session.longitud;
      document.getElementById("btnStartSession").textContent = "Continuar sesion";
      document.getElementById("btnNewSession").hidden = false;
    } else {
      document.getElementById("f-fecha").value = fmtDateInput(new Date());
      document.getElementById("btnStartSession").textContent = "Iniciar sesion";
      document.getElementById("btnNewSession").hidden = true;
    }
    showView("view-session");
  }

  document.getElementById("formSession").addEventListener("submit", function (e) {
    e.preventDefault();
    var fecha = document.getElementById("f-fecha").value;
    var equipo = document.getElementById("f-equipo").value.trim();
    var localizacion = document.getElementById("f-localizacion").value.trim();
    var sentido = document.getElementById("f-sentido").value.trim();
    var longitud = parseFloat(document.getElementById("f-longitud").value);

    if (!localizacion || !longitud || longitud <= 0) {
      alert("Completa localizacion y una longitud de tramo valida.");
      return;
    }

    if (!session) {
      session = {
        fecha: fecha,
        equipo: equipo,
        localizacion: localizacion,
        sentido: sentido,
        longitud: longitud,
        horaInicio: null,
        horaFin: null,
        lecturas: []
      };
    } else {
      session.fecha = fecha;
      session.equipo = equipo;
      session.localizacion = localizacion;
      session.sentido = sentido;
      session.longitud = longitud;
    }
    saveSession();
    goToMenu();
  });

  document.getElementById("btnNewSession").addEventListener("click", function () {
    if (confirm("Esto borrara todas las lecturas guardadas de la sesion actual. ¿Continuar?")) {
      localStorage.removeItem(STORAGE_KEY);
      session = null;
      initSessionView();
    }
  });

  document.getElementById("btnMenuNav").addEventListener("click", goToMenu);
  document.getElementById("btnRecordsNav").addEventListener("click", goToRecords);
  document.getElementById("btnDashboardNav").addEventListener("click", goToDashboard);

  // ---------- Menu view ----------

  function goToMenu() {
    document.getElementById("sessionSummary").textContent =
      session.localizacion + " · Sentido: " + (session.sentido || "-") +
      " · Tramo: " + session.longitud + " m";
    showView("view-menu");
  }

  function buildCategoryGrid() {
    var grid = document.getElementById("categoryGrid");
    grid.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-btn";
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        pending.categoria = cat;
        pending.distancia = session.longitud;
        goToStopwatch();
      });
      grid.appendChild(btn);
    });
  }

  // ---------- Per-category reading numbers ----------

  // Cada categoria lleva su propio consecutivo de "No. Lectura", igual que
  // las columnas paralelas del formato en papel. Se recalcula siempre a partir
  // del orden de los registros, para que quede correcto tras editar o eliminar.
  function nextLecturaFor(categoria) {
    var count = 0;
    session.lecturas.forEach(function (r) {
      if (r.categoria === categoria) count++;
    });
    return count + 1;
  }

  function recordsWithLectura() {
    var counters = {};
    return session.lecturas.map(function (r) {
      counters[r.categoria] = (counters[r.categoria] || 0) + 1;
      var copy = Object.assign({}, r);
      copy.lectura = counters[r.categoria];
      return copy;
    });
  }

  // ---------- Stopwatch view ----------

  function goToStopwatch() {
    resetStopwatch();
    document.getElementById("swCategoryLabel").textContent = pending.categoria;
    document.getElementById("swLecturaLabel").textContent = nextLecturaFor(pending.categoria);
    document.getElementById("swDistanceLabel").textContent = pending.distancia;
    document.getElementById("speedPreview").textContent = "";
    showView("view-stopwatch");
  }

  function fmtTime(ms) {
    var totalCs = Math.floor(ms / 10);
    var cs = totalCs % 100;
    var totalSec = Math.floor(totalCs / 100);
    var s = totalSec % 60;
    var m = Math.floor(totalSec / 60);
    function pad(n, len) { return String(n).padStart(len, "0"); }
    return pad(m, 2) + ":" + pad(s, 2) + "." + pad(cs, 2);
  }

  function currentElapsedMs() {
    if (sw.running) {
      return sw.elapsedMs + (performance.now() - sw.startTs);
    }
    return sw.elapsedMs;
  }

  // Refresca el display y habilita "Guardar lectura" en cuanto hay tiempo
  // transcurrido, sin exigir que el cronometro este en pausa.
  function renderTimer() {
    var elapsed = currentElapsedMs();
    document.getElementById("timerDisplay").textContent = fmtTime(elapsed);
    var sec = elapsed / 1000;
    if (sec > 0) {
      var kmh = (pending.distancia * 3.6) / sec;
      document.getElementById("speedPreview").textContent =
        "Tiempo: " + sec.toFixed(2) + " s · Velocidad estimada: " + kmh.toFixed(1) + " km/h";
    } else {
      document.getElementById("speedPreview").textContent = "";
    }
    document.getElementById("btnSaveReading").disabled = sec <= 0;
  }

  function tick() {
    if (!sw.running) return;
    renderTimer();
    sw.rafId = requestAnimationFrame(tick);
  }

  function resetStopwatch() {
    sw.running = false;
    sw.elapsedMs = 0;
    sw.startTs = 0;
    if (sw.rafId) cancelAnimationFrame(sw.rafId);
    document.getElementById("timerDisplay").textContent = fmtTime(0);
    document.getElementById("btnStart").hidden = false;
    document.getElementById("btnPause").hidden = true;
    document.getElementById("btnResume").hidden = true;
    document.getElementById("btnSaveReading").disabled = true;
    document.getElementById("speedPreview").textContent = "";
  }

  document.getElementById("btnStart").addEventListener("click", function () {
    sw.running = true;
    sw.startTs = performance.now();
    if (!session.horaInicio) {
      session.horaInicio = new Date().toTimeString().slice(0, 8);
      saveSession();
    }
    document.getElementById("btnStart").hidden = true;
    document.getElementById("btnPause").hidden = false;
    document.getElementById("btnResume").hidden = true;
    tick();
  });

  document.getElementById("btnPause").addEventListener("click", function () {
    sw.elapsedMs = currentElapsedMs();
    sw.running = false;
    if (sw.rafId) cancelAnimationFrame(sw.rafId);
    document.getElementById("btnPause").hidden = true;
    document.getElementById("btnResume").hidden = false;
    renderTimer();
  });

  document.getElementById("btnResume").addEventListener("click", function () {
    sw.running = true;
    sw.startTs = performance.now();
    document.getElementById("btnResume").hidden = true;
    document.getElementById("btnPause").hidden = false;
    tick();
  });

  document.getElementById("btnReset").addEventListener("click", function () {
    resetStopwatch();
  });

  document.getElementById("btnCancelReading").addEventListener("click", function () {
    resetStopwatch();
    goToMenu();
  });

  document.getElementById("btnSaveReading").addEventListener("click", function () {
    var sec = currentElapsedMs() / 1000;
    if (sec <= 0) return;
    var kmh = (pending.distancia * 3.6) / sec;
    var record = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      hora: new Date().toTimeString().slice(0, 8),
      categoria: pending.categoria,
      distancia: pending.distancia,
      tiempo: Math.round(sec * 100) / 100,
      velocidad: Math.round(kmh * 100) / 100
    };
    session.lecturas.push(record);
    session.horaFin = record.hora;
    saveSession();
    resetStopwatch();
    goToMenu();
  });

  // ---------- Records view ----------

  function goToRecords() {
    renderRecordsHeader();
    renderRecordsTable();
    showView("view-records");
  }

  function renderRecordsHeader() {
    var el = document.getElementById("recordsHeader");
    el.innerHTML =
      "Fecha: " + (session.fecha || "-") +
      " &middot; Equipo: " + (session.equipo || "-") +
      " &middot; Localizacion: " + session.localizacion +
      " &middot; Sentido: " + (session.sentido || "-") + "<br>" +
      "Hora inicio: " + (session.horaInicio || "-") +
      " &middot; Hora fin: " + (session.horaFin || "-") +
      " &middot; Longitud del tramo: " + session.longitud + " m";
  }

  function renderRecordsTable() {
    var tbody = document.getElementById("recordsBody");
    tbody.innerHTML = "";
    var empty = document.getElementById("recordsEmpty");
    empty.hidden = session.lecturas.length > 0;

    recordsWithLectura().forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + r.lectura + "</td>" +
        "<td>" + r.hora + "</td>" +
        "<td>" + r.categoria + "</td>" +
        "<td>" + r.distancia + "</td>" +
        "<td>" + r.tiempo.toFixed(2) + "</td>" +
        "<td>" + r.velocidad.toFixed(1) + "</td>";
      var tdActions = document.createElement("td");
      tdActions.className = "row-actions";
      var btnEdit = document.createElement("button");
      btnEdit.className = "btn-link-text";
      btnEdit.textContent = "Editar";
      btnEdit.addEventListener("click", function () { openEditModal(r.id); });
      var btnDel = document.createElement("button");
      btnDel.className = "btn-danger-text";
      btnDel.textContent = "Eliminar";
      btnDel.addEventListener("click", function () { deleteRecord(r.id); });
      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  function deleteRecord(id) {
    if (!confirm("¿Eliminar esta lectura?")) return;
    session.lecturas = session.lecturas.filter(function (r) { return r.id !== id; });
    saveSession();
    renderRecordsTable();
  }

  function openEditModal(id) {
    var r = session.lecturas.find(function (x) { return x.id === id; });
    if (!r) return;
    editingId = id;
    var sel = document.getElementById("e-categoria");
    sel.innerHTML = "";
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (c === r.categoria) opt.selected = true;
      sel.appendChild(opt);
    });
    document.getElementById("e-distancia").value = r.distancia;
    document.getElementById("e-tiempo").value = r.tiempo;
    document.getElementById("editModal").hidden = false;
  }

  document.getElementById("btnEditCancel").addEventListener("click", function () {
    document.getElementById("editModal").hidden = true;
    editingId = null;
  });

  document.getElementById("btnEditSave").addEventListener("click", function () {
    var r = session.lecturas.find(function (x) { return x.id === editingId; });
    if (!r) return;
    var cat = document.getElementById("e-categoria").value;
    var dist = parseFloat(document.getElementById("e-distancia").value);
    var tiempo = parseFloat(document.getElementById("e-tiempo").value);
    if (!dist || dist <= 0 || !tiempo || tiempo <= 0) {
      alert("Distancia y tiempo deben ser valores positivos.");
      return;
    }
    r.categoria = cat;
    r.distancia = dist;
    r.tiempo = Math.round(tiempo * 100) / 100;
    r.velocidad = Math.round((dist * 3.6 / tiempo) * 100) / 100;
    saveSession();
    document.getElementById("editModal").hidden = true;
    editingId = null;
    renderRecordsTable();
  });

  document.getElementById("btnBackToMenu").addEventListener("click", goToMenu);
  document.getElementById("btnDashboardBack").addEventListener("click", goToMenu);

  // ---------- Exportar Excel (analisis estadistico) ----------

  document.getElementById("btnExportExcel").addEventListener("click", async function () {
    var btn = document.getElementById("btnExportExcel");
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando...";
    try {
      await VP.downloadWorkbook(session);
    } catch (e) {
      alert("No se pudo generar el Excel: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // ---------- Compartir lecturas con el equipo (.json) ----------

  document.getElementById("btnExportJson").addEventListener("click", function () {
    VP.downloadSessionJson(session);
  });

  document.getElementById("btnImportJson").addEventListener("click", function () {
    document.getElementById("importFileInput").click();
  });

  document.getElementById("importFileInput").addEventListener("change", async function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;

    var totalAdded = 0;
    var totalSkipped = 0;
    var fileErrors = [];

    for (var i = 0; i < files.length; i++) {
      try {
        var text = await files[i].text();
        var data = JSON.parse(text);
        var incomingSession = data && data.session ? data.session : data;
        if (!incomingSession || !Array.isArray(incomingSession.lecturas)) {
          throw new Error("no tiene el formato esperado");
        }
        var result = VP.mergeLecturas(session.lecturas, incomingSession.lecturas);
        session.lecturas = result.merged;
        totalAdded += result.added;
        totalSkipped += result.skipped;
      } catch (err) {
        fileErrors.push(files[i].name + ": " + err.message);
      }
    }

    if (session.lecturas.length) {
      var horas = session.lecturas.map(function (r) { return r.hora; }).filter(Boolean).sort();
      if (horas.length) {
        session.horaInicio = session.horaInicio ? (session.horaInicio < horas[0] ? session.horaInicio : horas[0]) : horas[0];
        session.horaFin = session.horaFin ? (session.horaFin > horas[horas.length - 1] ? session.horaFin : horas[horas.length - 1]) : horas[horas.length - 1];
      }
    }

    saveSession();
    e.target.value = "";
    renderRecordsHeader();
    renderRecordsTable();

    var msg = "Se agregaron " + totalAdded + " lectura(s) nueva(s).";
    if (totalSkipped) msg += " Se omitieron " + totalSkipped + " registro(s) con formato invalido.";
    if (fileErrors.length) msg += "\n\nNo se pudieron leer:\n" + fileErrors.join("\n");
    alert(msg);
  });

  // ---------- Print / PDF ----------

  document.getElementById("btnPrint").addEventListener("click", function () {
    document.getElementById("printArea").innerHTML = VP.buildPrintHtml(session);
    window.print();
  });

  // ---------- Dashboard ----------

  function goToDashboard() {
    renderDashboard();
    showView("view-dashboard");
  }

  function renderDashboard() {
    dashboardCharts.forEach(function (c) { c.destroy(); });
    dashboardCharts = [];

    var container = document.getElementById("dashboardContent");
    container.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var records = session.lecturas.filter(function (r) { return r.categoria === cat; });
      var label = VP.CATEGORY_LABELS[cat];
      var card = document.createElement("div");
      card.className = "dash-card";

      if (records.length < 2) {
        card.innerHTML =
          "<h3>" + label + "</h3>" +
          "<p class='muted small'>Lecturas: " + records.length +
          " &middot; se necesitan al menos 2 para calcular media, desviacion y la curva.</p>";
        container.appendChild(card);
        return;
      }

      var speeds = records.map(function (r) { return r.velocidad; });
      var m = VP.mean(speeds);
      var sd = VP.sampleStdDev(speeds);
      var nMin = VP.sampleSizeRequired(sd, 1.96, 1);
      var cumple = records.length >= nMin;

      card.innerHTML =
        "<h3>" + label + "</h3>" +
        "<div class='dash-stats'>" +
          "<div><span class='dash-stat-label'>Lecturas</span><span class='dash-stat-value'>" + records.length + "</span></div>" +
          "<div><span class='dash-stat-label'>Media</span><span class='dash-stat-value'>" + m.toFixed(1) + " km/h</span></div>" +
          "<div><span class='dash-stat-label'>Desviacion</span><span class='dash-stat-value'>" + sd.toFixed(2) + "</span></div>" +
          "<div><span class='dash-stat-label'>n minimo (95%)</span><span class='dash-stat-value'>" + nMin + "</span></div>" +
        "</div>" +
        "<p class='small " + (cumple ? "dash-ok" : "dash-warn") + "'>" +
          (cumple
            ? "✓ Cumple el tamaño de muestra minimo (E = 1 km/h)"
            : "⚠ Faltan lecturas para el 95% de confianza (E = 1 km/h)") +
        "</p>" +
        "<div class='dash-chart-wrap'><canvas></canvas></div>";
      container.appendChild(card);

      var canvas = card.querySelector("canvas");
      var pts = VP.curvePointsDense(m, sd, 80);
      // Eje X numerico (linear), no por categorias: con un rango muy chico
      // (desviacion pequena) varias etiquetas redondeadas caerian en el
      // mismo valor y la curva se ve escalonada en vez de suave.
      var chart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
          datasets: [{
            label: "f(v)",
            data: pts.map(function (p) { return { x: p.x, y: p.y }; }),
            borderColor: "#2d5080",
            backgroundColor: "rgba(45, 80, 128, 0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function (items) { return items[0].parsed.x.toFixed(2) + " km/h"; },
                label: function (item) { return "f(v) = " + item.parsed.y.toFixed(4); }
              }
            }
          },
          scales: {
            x: {
              type: "linear",
              title: { display: true, text: "Velocidad (km/h)" },
              grid: { color: "#f0f2f4" },
              ticks: {
                callback: function (value) { return Number(value).toFixed(sd < 1 ? 2 : (sd < 10 ? 1 : 0)); }
              }
            },
            y: { title: { display: true, text: "f(v)" }, beginAtZero: true, grid: { color: "#f0f2f4" } }
          }
        }
      });
      dashboardCharts.push(chart);
    });
  }

  // ---------- Instalar app ----------

  var DISMISS_KEY = "velpunto_install_dismissed";
  var deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function showInstallBanner(mode) {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;
    var banner = document.getElementById("installBanner");
    var btn = document.getElementById("btnInstallApp");
    if (mode === "ios") {
      document.getElementById("installText").textContent =
        "Para instalar: toca compartir ⬆️ y luego \"Agregar a pantalla de inicio\".";
      btn.hidden = true;
    } else {
      document.getElementById("installText").textContent =
        "Instala esta app en tu celular para usarla sin conexion.";
      btn.hidden = false;
    }
    banner.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner("android");
  });

  document.getElementById("btnInstallApp").addEventListener("click", function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () {
      deferredInstallPrompt = null;
      document.getElementById("installBanner").hidden = true;
    });
  });

  document.getElementById("btnInstallDismiss").addEventListener("click", function () {
    document.getElementById("installBanner").hidden = true;
    localStorage.setItem(DISMISS_KEY, "1");
  });

  window.addEventListener("appinstalled", function () {
    document.getElementById("installBanner").hidden = true;
    deferredInstallPrompt = null;
  });

  if (isIos() && !isStandalone()) {
    showInstallBanner("ios");
  }

  // ---------- Cambiar estudio ----------

  document.getElementById("btnChangeStudyVelocidad").addEventListener("click", function () {
    VP.goToStudyTypeChooser();
  });

  // ---------- Init ----------

  VP.app = {
    init: function () {
      buildCategoryGrid();
      initSessionView();
    }
  };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline-first still works without SW */ });
    });
  }
})();
