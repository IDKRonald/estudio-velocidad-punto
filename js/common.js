// Namespace compartido entre app.js y export.js
var VP = {};

VP.CATEGORIES = [
  "Particular",
  "Moto",
  "Taxi",
  "Bus",
  "Carga liviana",
  "Carga pesada"
];

// Etiquetas oficiales tal como aparecen en el formato en papel
// (Formato Velocidad.docx), usadas en el documento impreso/PDF y en Excel.
VP.CATEGORY_LABELS = {
  "Particular": "AUTO PARTICULAR",
  "Moto": "MOTOCICLETAS",
  "Taxi": "TAXIS INDIVIDUALES",
  "Bus": "BUSES COLECTIVOS",
  "Carga liviana": "CARGA LIVIANA",
  "Carga pesada": "CARGA PESADA"
};

// El formato en papel divide las categorias en dos tablas de 3 columnas.
VP.PRINT_GROUPS = [
  ["Particular", "Moto", "Taxi"],
  ["Bus", "Carga liviana", "Carga pesada"]
];

// ---------- Estadistica ----------

VP.mean = function (arr) {
  return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
};

// Desviacion estandar muestral (n-1), equivalente a DESVEST.M en Excel.
VP.sampleStdDev = function (arr) {
  if (arr.length < 2) return 0;
  var m = VP.mean(arr);
  var sumSq = arr.reduce(function (acc, x) { return acc + (x - m) * (x - m); }, 0);
  return Math.sqrt(sumSq / (arr.length - 1));
};

VP.normalPdf = function (x, m, sd) {
  if (sd <= 0) return 0;
  var coeff = 1 / (sd * Math.sqrt(2 * Math.PI));
  return coeff * Math.exp(-0.5 * Math.pow((x - m) / sd, 2));
};

// n = Z^2 * sigma^2 / E^2 (tamano de muestra minimo)
VP.sampleSizeRequired = function (sd, Z, E) {
  Z = Z || 1.96;
  E = E || 1;
  if (sd <= 0) return 0;
  return Math.ceil((Z * Z * sd * sd) / (E * E));
};

// Puntos de la curva normal cada `step` km/h, cubriendo +/- 3.5 desviaciones.
// Usado para la tabla de Excel: el enunciado exige el paso fijo de 2 km/h.
VP.curvePoints = function (m, sd, step) {
  step = step || 2;
  if (sd <= 0) return [];
  var lo = Math.floor((m - 3.5 * sd) / step) * step;
  var hi = Math.ceil((m + 3.5 * sd) / step) * step;
  var pts = [];
  for (var x = lo; x <= hi + 1e-9; x += step) {
    var xr = Math.round(x * 100) / 100;
    pts.push({ x: xr, y: VP.normalPdf(xr, m, sd) });
  }
  return pts;
};

// Puntos densos (n uniformes entre +/- 3.5 desviaciones), solo para graficar.
// A diferencia de curvePoints, no depende del paso de 2 km/h: con una
// desviacion muy chica, un paso de 2 km/h puede dejar apenas 1 o 2 puntos
// (la curva se ve como una linea recta en vez de una campana). Aqui el
// numero de puntos es fijo, asi que la forma siempre se ve suave.
VP.curvePointsDense = function (m, sd, n) {
  n = n || 80;
  if (sd <= 0) return [];
  var lo = m - 3.5 * sd;
  var hi = m + 3.5 * sd;
  var pts = [];
  for (var i = 0; i <= n; i++) {
    // Sin redondear: con una desviacion muy chica, redondear x colapsa
    // varios de los n puntos en el mismo valor (se ve la curva "escalonada").
    var x = lo + (hi - lo) * (i / n);
    pts.push({ x: x, y: VP.normalPdf(x, m, sd) });
  }
  return pts;
};

// ---------- Grafica de curva normal (canvas, reutilizada en dashboard y Excel) ----------

VP.drawNormalCurve = function (ctx, width, height, opts) {
  var mean = opts.mean, sd = opts.sd, title = opts.title || "";
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!(sd > 0)) {
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Datos insuficientes para graficar", width / 2, height / 2);
    ctx.restore();
    return;
  }

  var pts = VP.curvePoints(mean, sd, 2);
  // Titulos largos ("Distribucion de Velocidades - CARGA PESADA") no caben
  // en una sola linea en canvases angostos (movil); se parten en dos.
  var titleLines = title ? (title.indexOf(" - ") >= 0 ? title.split(/ - (.+)/).filter(Boolean).map(function (s, i) { return i === 1 ? "- " + s : s; }) : [title]) : [];
  var padL = 42, padR = 16, padT = titleLines.length > 1 ? 32 : (titleLines.length ? 20 : 14), padB = 28;
  var plotW = width - padL - padR;
  var plotH = height - padT - padB;

  var xMin = pts[0].x, xMax = pts[pts.length - 1].x;
  var yMax = Math.max.apply(null, pts.map(function (p) { return p.y; })) * 1.15;

  function px(x) { return padL + ((x - xMin) / (xMax - xMin)) * plotW; }
  function py(y) { return padT + plotH - (y / yMax) * plotH; }

  // Titulo (partido en 2 lineas si hace falta, para no desbordar el canvas)
  if (titleLines.length) {
    ctx.fillStyle = "#1e3a5f";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    titleLines.forEach(function (line, idx) {
      ctx.fillText(line, width / 2, 14 + idx * 14);
    });
  }

  // Grid horizontal + eje Y
  ctx.strokeStyle = "#e3e7eb";
  ctx.fillStyle = "#5f6b7a";
  ctx.font = "10px Arial";
  ctx.textAlign = "right";
  var ySteps = 4;
  for (var i = 0; i <= ySteps; i++) {
    var yVal = (yMax / ySteps) * i;
    var yPix = py(yVal);
    ctx.beginPath();
    ctx.moveTo(padL, yPix);
    ctx.lineTo(padL + plotW, yPix);
    ctx.stroke();
    ctx.fillText(yVal.toFixed(2), padL - 6, yPix + 3);
  }

  // Eje X
  ctx.strokeStyle = "#9aa6b2";
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  ctx.fillStyle = "#5f6b7a";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  // Espacia las etiquetas segun el ancho disponible para que no se amontonen
  // cuando hay muchos puntos (varianza alta -> rango amplio de la curva).
  var minLabelSpacing = 30;
  var maxLabels = Math.max(2, Math.floor(plotW / minLabelSpacing));
  var labelEvery = Math.max(1, Math.ceil(pts.length / maxLabels));
  pts.forEach(function (p, idx) {
    if (idx % labelEvery !== 0) return;
    ctx.fillText(String(p.x), px(p.x), padT + plotH + 14);
  });

  // Curva (suavizada con quadraticCurveTo entre puntos medios)
  ctx.strokeStyle = "#2d5080";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(pts[0].x), py(pts[0].y));
  for (var k = 1; k < pts.length - 1; k++) {
    var xc = (px(pts[k].x) + px(pts[k + 1].x)) / 2;
    var yc = (py(pts[k].y) + py(pts[k + 1].y)) / 2;
    ctx.quadraticCurveTo(px(pts[k].x), py(pts[k].y), xc, yc);
  }
  ctx.lineTo(px(pts[pts.length - 1].x), py(pts[pts.length - 1].y));
  ctx.stroke();

  // Relleno suave bajo la curva
  ctx.lineTo(px(pts[pts.length - 1].x), py(0));
  ctx.lineTo(px(pts[0].x), py(0));
  ctx.closePath();
  ctx.fillStyle = "rgba(45, 80, 128, 0.08)";
  ctx.fill();

  ctx.restore();
};
