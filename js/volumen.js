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
    document.querySelectorAll("#volumen-app .vol-view").forEach(function (v) {
      v.classList.toggle("active", v.id === id);
    });
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
        aforos: []
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
    saveVolumenSession();
    goToConteo();
  }

  // ---------- Conteo ----------

  var conteoTimerId = null;

  function findActiveAforo() {
    for (var i = session.aforos.length - 1; i >= 0; i--) {
      if (!session.aforos[i].horaFin) return session.aforos[i];
    }
    return null;
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
    if (conteoTimerId) clearInterval(conteoTimerId);
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
    saveVolumenSession();
    if (conteoTimerId) {
      clearInterval(conteoTimerId);
      conteoTimerId = null;
    }
    goToMovimientoPicker();
  }

  document.getElementById("btnFinalizarAforo").addEventListener("click", finalizarAforo);

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
