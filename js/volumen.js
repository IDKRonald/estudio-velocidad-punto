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

  function selectMovimiento(key) {
    var now = new Date();
    var aforo = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      movimiento: key,
      inicioMs: now.getTime(),
      horaInicio: now.toTimeString().slice(0, 8),
      horaFin: null,
      intervalos: [
        {
          inicio: now.toTimeString().slice(0, 8),
          fin: new Date(now.getTime() + 15 * 60 * 1000).toTimeString().slice(0, 8),
          counts: { Particular: 0, Moto: 0, Taxi: 0, Bus: 0, "Carga liviana": 0, "Carga pesada": 0 }
        }
      ]
    };
    session.aforos.push(aforo);
    saveVolumenSession();
    goToConteo();
  }

  // ---------- Conteo (stub -- Task 2 implements the real tally screen) ----------

  function goToConteo() {
    var aforo = session.aforos[session.aforos.length - 1];
    document.getElementById("conteoMovimientoLabel").textContent = movimientoLabel(aforo.movimiento);
    showVolumenView("view-volumen-conteo");
  }

  // ---------- Init ----------

  VP.volumen = {
    init: function () {
      initVolumenSessionView();
    }
  };
})();
