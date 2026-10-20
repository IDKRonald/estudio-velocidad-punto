(function () {
  "use strict";

  var VOL_STORAGE_KEY = "velpunto_volumen_session_v1";

  /** @type {{fecha:string, equipo:string, ubicacion:string,
   *          aforos:Array<Object>}|null} */
  var session = null;

  // ---------- Persistence ----------

  function loadVolumenSession() {
    try {
      var raw = localStorage.getItem(VOL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveVolumenSession() {
    try {
      localStorage.setItem(VOL_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      alert("No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado).");
    }
  }

  // ---------- View routing ----------

  function showVolumenView(id) {
    // El aforo activo avanza su intervalo por reloj: si no estas viendo el
    // conteo, el tick no debe seguir corriendo ni pudiendo expulsarte de
    // cualquier otra pantalla cuando el aforo activo cambie.
    if (id !== "view-volumen-conteo") stopConteoTimer();
    document.querySelectorAll("#volumen-app .vol-view").forEach(function (v) {
      v.classList.toggle("active", v.id === id);
    });
    document.getElementById("btnVolumenRecordsNav").hidden = (id === "view-volumen-session");
  }

  // ---------- Movimiento helpers ----------

  function movimientoLabel(key) {
    var found = VP.MOVIMIENTOS.filter(function (m) { return m.key === key; })[0];
    return found ? found.label : key;
  }

  // ---------- Session view ----------

  function fmtDateInput(d) {
    return d.toISOString().slice(0, 10);
  }

  function initVolumenSessionView() {
    var existing = loadVolumenSession();
    if (existing) {
      session = existing;
      document.getElementById("v-fecha").value = session.fecha;
      document.getElementById("v-equipo").value = session.equipo || "";
      document.getElementById("v-ubicacion").value = session.ubicacion;
      document.getElementById("btnStartVolumenSession").textContent = "Continuar sesion";
      document.getElementById("btnNewVolumenSession").hidden = false;
    } else {
      document.getElementById("v-fecha").value = fmtDateInput(new Date());
      document.getElementById("btnStartVolumenSession").textContent = "Iniciar sesion";
      document.getElementById("btnNewVolumenSession").hidden = true;
    }
    showVolumenView("view-volumen-session");
  }

  document.getElementById("formVolumenSession").addEventListener("submit", function (e) {
    e.preventDefault();
    var fecha = document.getElementById("v-fecha").value;
    var equipo = document.getElementById("v-equipo").value.trim();
    var ubicacion = document.getElementById("v-ubicacion").value.trim();

    if (!ubicacion) {
      alert("Completa la ubicacion del estudio.");
      return;
    }

    if (!session) {
      session = {
        fecha: fecha,
        equipo: equipo,
        ubicacion: ubicacion,
        aforos: [],
        activeAforoId: null
      };
    } else {
      session.fecha = fecha;
      session.equipo = equipo;
      session.ubicacion = ubicacion;
    }
    saveVolumenSession();
    goToMovimientoPicker();
  });

  document.getElementById("btnNewVolumenSession").addEventListener("click", function () {
    if (confirm("Esto borrara todos los aforos guardados de la sesion actual. ¿Continuar?")) {
      localStorage.removeItem(VOL_STORAGE_KEY);
      session = null;
      initVolumenSessionView();
    }
  });

  document.getElementById("btnChangeStudyVolumen").addEventListener("click", function () {
    stopConteoTimer();
    VP.goToStudyTypeChooser();
  });

  // ---------- Movimiento picker ----------

  function buildMovimientoGridOnce() {
    var grid = document.getElementById("movimientoGrid");
    if (grid.children.length) return;
    VP.MOVIMIENTOS.forEach(function (m) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-btn";
      btn.textContent = m.label;
      btn.addEventListener("click", function () {
        selectMovimiento(m.key);
      });
      grid.appendChild(btn);
    });
  }

  function goToMovimientoPicker() {
    // Si hay un aforo activo (sin finalizar), no se puede "perder" navegando:
    // cualquier camino que llegaria al selector de movimiento vuelve al
    // conteo en curso hasta que se finalice o se elimine explicitamente.
    if (findActiveAforo()) {
      goToConteo();
      return;
    }
    buildMovimientoGridOnce();
    showVolumenView("view-volumen-movimiento");
  }

  function fmtHora(date) {
    return date.toTimeString().slice(0, 8);
  }

  function emptyCounts() {
    return { Particular: 0, Moto: 0, Taxi: 0, Bus: 0, "Carga liviana": 0, "Carga pesada": 0 };
  }

  function selectMovimiento(key) {
    if (session.activeAforoId) {
      // Ya hay un aforo sin finalizar: no se crea uno nuevo por encima.
      goToConteo();
      return;
    }
    var now = new Date();
    var aforo = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      movimiento: key,
      inicioMs: now.getTime(),
      horaInicio: fmtHora(now),
      horaFin: null,
      intervalos: [
        {
          inicio: fmtHora(now),
          fin: fmtHora(new Date(now.getTime() + 15 * 60 * 1000)),
          counts: emptyCounts()
        }
      ]
    };
    session.aforos.push(aforo);
    session.activeAforoId = aforo.id;
    saveVolumenSession();
    goToConteo();
  }

  // ---------- Conteo ----------

  var conteoTimerId = null;

  function stopConteoTimer() {
    if (conteoTimerId) {
      clearInterval(conteoTimerId);
      conteoTimerId = null;
    }
  }

  // El aforo activo es el que ESTE dispositivo inicio (session.activeAforoId),
  // nunca inferido de horaFin===null: un aforo importado de un companero
  // puede llegar sin finalizar y no por eso debe "tomar control" del conteo
  // de este telefono.
  function findActiveAforo() {
    if (!session.activeAforoId) return null;
    return session.aforos.filter(function (a) { return a.id === session.activeAforoId; })[0] || null;
  }

  function currentIntervalIndex(aforo) {
    return Math.floor((Date.now() - aforo.inicioMs) / (15 * 60 * 1000));
  }

  // Devuelve true si agrego algun intervalo nuevo (para que el llamador sepa
  // si hace falta guardar).
  function ensureIntervalsUpTo(aforo, index) {
    var added = false;
    while (aforo.intervalos.length <= index) {
      var n = aforo.intervalos.length;
      var startMs = aforo.inicioMs + n * 15 * 60 * 1000;
      var endMs = startMs + 15 * 60 * 1000;
      aforo.intervalos.push({
        inicio: fmtHora(new Date(startMs)),
        fin: fmtHora(new Date(endMs)),
        counts: emptyCounts()
      });
      added = true;
    }
    return added;
  }

  function buildTallyGridOnce() {
    var grid = document.getElementById("tallyGrid");
    if (grid.children.length) return;
    VP.CATEGORIES.forEach(function (cat) {
      var card = document.createElement("div");
      card.className = "tally-card";
      card.innerHTML =
        "<div class='tally-label'>" + cat + "</div>" +
        "<div class='tally-count' data-tally-count='" + cat + "'>0</div>" +
        "<div class='tally-buttons'>" +
          "<button type='button' class='btn btn-ghost tally-minus'>-1</button>" +
          "<button type='button' class='btn btn-primary tally-plus'>+1</button>" +
        "</div>";
      card.querySelector(".tally-plus").addEventListener("click", function () { changeCount(cat, 1); });
      card.querySelector(".tally-minus").addEventListener("click", function () { changeCount(cat, -1); });
      grid.appendChild(card);
    });
  }

  function renderConteo() {
    var aforo = findActiveAforo();
    if (!aforo) {
      goToMovimientoPicker();
      return;
    }
    var idx = currentIntervalIndex(aforo);
    if (ensureIntervalsUpTo(aforo, idx)) saveVolumenSession();
    var interval = aforo.intervalos[idx];
    document.getElementById("conteoMovimientoLabel").textContent = movimientoLabel(aforo.movimiento);
    document.getElementById("conteoIntervaloLabel").textContent = interval.inicio + " - " + interval.fin;
    VP.CATEGORIES.forEach(function (cat) {
      document.querySelector("[data-tally-count='" + cat + "']").textContent = interval.counts[cat];
    });
  }

  function goToConteo() {
    buildTallyGridOnce();
    renderConteo();
    stopConteoTimer();
    conteoTimerId = setInterval(renderConteo, 1000);
    showVolumenView("view-volumen-conteo");
  }

  function changeCount(categoria, delta) {
    var aforo = findActiveAforo();
    if (!aforo) return;
    var idx = currentIntervalIndex(aforo);
    ensureIntervalsUpTo(aforo, idx);
    var interval = aforo.intervalos[idx];
    interval.counts[categoria] = Math.max(0, interval.counts[categoria] + delta);
    saveVolumenSession();
    renderConteo();
  }

  function finalizarAforo() {
    var aforo = findActiveAforo();
    if (!aforo) return;
    aforo.horaFin = fmtHora(new Date());
    session.activeAforoId = null;
    saveVolumenSession();
    stopConteoTimer();
    goToMovimientoPicker();
  }

  document.getElementById("btnFinalizarAforo").addEventListener("click", finalizarAforo);

  // ---------- Ver conteos (correccion + multi-aforo) ----------

  var selectedAforoId = null;

  function goToRegistros() {
    renderAforoSelector();
    showVolumenView("view-volumen-registros");
  }

  function renderAforoSelector() {
    var sel = document.getElementById("aforoSelect");
    sel.innerHTML = "";
    session.aforos.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = movimientoLabel(a.movimiento) + " (" + a.horaInicio + ")";
      sel.appendChild(opt);
    });
    if (!session.aforos.length) {
      selectedAforoId = null;
      renderRegistrosTable();
      return;
    }
    if (!selectedAforoId || !session.aforos.some(function (a) { return a.id === selectedAforoId; })) {
      selectedAforoId = session.aforos[session.aforos.length - 1].id;
    }
    sel.value = selectedAforoId;
    renderRegistrosTable();
  }

  document.getElementById("aforoSelect").addEventListener("change", function (e) {
    selectedAforoId = e.target.value;
    renderRegistrosTable();
  });

  function renderRegistrosTable() {
    var tbody = document.getElementById("registrosBody");
    tbody.innerHTML = "";
    var aforo = session.aforos.filter(function (a) { return a.id === selectedAforoId; })[0];
    if (!aforo) return;
    aforo.intervalos.forEach(function (interval) {
      var tr = document.createElement("tr");
      var tdLabel = document.createElement("td");
      tdLabel.textContent = interval.inicio + " - " + interval.fin;
      tr.appendChild(tdLabel);
      VP.CATEGORIES.forEach(function (cat) {
        var td = document.createElement("td");
        var input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.value = interval.counts[cat];
        input.addEventListener("change", function () {
          var val = Math.max(0, parseInt(input.value, 10) || 0);
          interval.counts[cat] = val;
          input.value = val;
          saveVolumenSession();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function eliminarAforoActual() {
    if (!selectedAforoId) return;
    if (!confirm("¿Eliminar este aforo completo?")) return;
    if (session.activeAforoId === selectedAforoId) {
      session.activeAforoId = null;
      stopConteoTimer();
    }
    session.aforos = session.aforos.filter(function (a) { return a.id !== selectedAforoId; });
    selectedAforoId = null;
    saveVolumenSession();
    if (session.aforos.length) {
      renderAforoSelector();
    } else {
      goToMovimientoPicker();
    }
  }

  document.getElementById("btnEliminarAforo").addEventListener("click", eliminarAforoActual);
  document.getElementById("btnVolumenRecordsNav").addEventListener("click", goToRegistros);
  document.getElementById("btnVolumenRecordsBack").addEventListener("click", goToMovimientoPicker);

  // ---------- Compartir aforos con el equipo (.json) ----------

  document.getElementById("btnExportVolumenJson").addEventListener("click", function () {
    VP.downloadVolumenSessionJson(session);
  });

  document.getElementById("btnImportVolumenJson").addEventListener("click", function () {
    document.getElementById("volumenImportFileInput").click();
  });

  document.getElementById("volumenImportFileInput").addEventListener("change", async function (e) {
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
        if (!data || data.formato !== "estudio-volumen-vehicular" || !incomingSession || !Array.isArray(incomingSession.aforos)) {
          throw new Error("no tiene el formato esperado");
        }
        var result = VP.mergeAforos(session.aforos, incomingSession.aforos);
        session.aforos = result.merged;
        totalAdded += result.added;
        totalSkipped += result.skipped;
      } catch (err) {
        fileErrors.push(files[i].name + ": " + err.message);
      }
    }

    saveVolumenSession();
    e.target.value = "";
    renderAforoSelector();

    var msg = "Se agregaron " + totalAdded + " aforo(s) nuevo(s).";
    if (totalSkipped) msg += " Se omitieron " + totalSkipped + " registro(s) con formato invalido.";
    if (fileErrors.length) msg += "\n\nNo se pudieron leer:\n" + fileErrors.join("\n");
    alert(msg);
  });

  // ---------- Init ----------

  VP.volumen = {
    init: function () {
      session = loadVolumenSession();
      if (session && findActiveAforo()) {
        goToConteo();
      } else {
        initVolumenSessionView();
      }
    }
  };
})();
