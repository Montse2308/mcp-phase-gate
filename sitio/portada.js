// Lo único que hace la portada con JavaScript, antes de pintarse: llevar a la demo los enlaces de antes, que
// traían la vista o el idioma en el hash, y elegir el idioma de quien llega. Sin dependencias.
(function () {
  var CLAVE = "pg-idioma"; // la misma que usa el Studio, en este mismo origen
  var raiz = document.documentElement;
  var base = raiz.getAttribute("data-base") || "";
  var aqui = raiz.getAttribute("lang");
  // Las vistas del Studio, que scripts/portada.mjs copia de studio/src/rutas.ts. La portada no mantiene ninguna
  // lista propia: ni de sus anclas (que cambian cuando crece) ni de las vistas (que son del Studio).
  var VISTAS = (raiz.getAttribute("data-vistas") || "").split(" ");

  function esIdioma(valor) {
    return valor === "es" || valor === "en";
  }
  function guardado() {
    try {
      var valor = window.localStorage.getItem(CLAVE);
      return esIdioma(valor) ? valor : null;
    } catch (e) {
      return null;
    }
  }
  function guardar(idioma) {
    try {
      window.localStorage.setItem(CLAVE, idioma);
    } catch (e) {
      // sin almacenamiento, la elección dura lo que la página
    }
  }
  function delNavegador() {
    var lista = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < lista.length; i++) {
      var base2 = String(lista[i] || "").toLowerCase().split(/[-_]/)[0];
      if (esIdioma(base2)) return base2;
    }
    return null;
  }

  // ¿Este hash es de la demo? Lo es si trae una ruta (#/tablero/TIENDA/…), una consulta (#?lang=en, #?sobrio=1)
  // o el nombre de una vista (#red). Cualquier otro fragmento es de esta página: una ancla de hoy o una que la
  // portada gane mañana. Al revés —una lista cerrada de anclas— cada sección nueva mandaría a la demo a quien
  // llegara con su enlace.
  function esDeLaDemo(hash) {
    var ruta = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    if (ruta === "") return false;
    var primera = ruta.charAt(0);
    if (primera === "/" || primera === "?") return true;
    return VISTAS.indexOf(ruta.split(/[/?]/)[0]) !== -1;
  }

  // 1. El idioma del enlace se recuerda siempre, aunque el hash lleve a la demo: el Studio lee esta misma clave,
  //    así que `?lang=es#/red` abre la demo en español.
  var pedido = new URLSearchParams(window.location.search).get("lang");
  if (esIdioma(pedido)) guardar(pedido);

  // 2. Un enlace de la demo de antes: la demo vive ahora en demo/ y el hash se conserva tal cual.
  var hash = window.location.hash;
  if (esDeLaDemo(hash)) {
    window.location.replace(base + "demo/" + hash);
    return;
  }

  // 3. A qué portada. ?lang=es|en manda; sin él, lo que ya elegiste (aquí o en el Studio) y, si no elegiste, el
  //    de tu navegador. Solo la portada en inglés decide: la de español es de quien ya la pidió.
  var destino = esIdioma(pedido) ? pedido : aqui === "en" && base === "" ? guardado() || delNavegador() : aqui;
  if (destino && destino !== aqui) {
    window.location.replace((destino === "es" ? (base === "" ? "es/" : "./") : base === "" ? "./" : "../") + hash);
    return;
  }

  // 4. El selector EN / ES recuerda la elección, para que el Studio y la portada recuerden lo mismo.
  document.addEventListener("click", function (evento) {
    var enlace = evento.target && evento.target.closest ? evento.target.closest("[data-idioma]") : null;
    if (enlace) guardar(enlace.getAttribute("data-idioma"));
  });
})();
