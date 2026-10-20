(function () {
  "use strict";

  VP.goToStudyTypeChooser = function () {
    document.getElementById("velocidad-app").hidden = true;
    document.getElementById("volumen-app").hidden = true;
    document.getElementById("studytype-screen").hidden = false;
  };

  document.getElementById("btnChooseVelocidad").addEventListener("click", function () {
    document.getElementById("studytype-screen").hidden = true;
    document.getElementById("velocidad-app").hidden = false;
    VP.app.init();
  });

  document.getElementById("btnChooseVolumen").addEventListener("click", function () {
    document.getElementById("studytype-screen").hidden = true;
    document.getElementById("volumen-app").hidden = false;
    VP.volumen.init();
  });
})();
