// Lo único que hace la portada con JavaScript, antes de pintarse: llevar a la demo los enlaces de antes, que
// traían la vista o el idioma en el hash, y elegir el idioma de quien llega. Sin dependencias.
(function () {
  var CLAVE = "pg-idioma"; // la misma que usa el Studio, en este mismo origen
  var ANCLAS = ["contenido", "fases", "capturas", "probar"]; // las anclas de la portada: lista cerrada
  var raiz = document.documentElement;
  var base = raiz.getAttribute("data-base") || "";
  var aqui = raiz.getAttribute("lang");

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

  // 1. Un enlace de la demo de antes (#/tablero/…, #red, #?lang=en, #?sobrio=1): la demo vive ahora en demo/ y
  //    el hash se conserva tal cual. Lo que no es una ancla de esta página es de la demo.
  var hash = window.location.hash;
  if (hash && hash !== "#" && ANCLAS.indexOf(hash.slice(1)) === -1) {
    window.location.replace(base + "demo/" + hash);
    return;
  }

  // 2. El idioma. ?lang=es|en lo manda y se recuerda; sin él, lo que ya elegiste (aquí o en el Studio) y, si no
  //    elegiste, el de tu navegador. Solo la portada en inglés decide: la de español es de quien ya la pidió.
  var pedido = new URLSearchParams(window.location.search).get("lang");
  if (esIdioma(pedido)) guardar(pedido);
  var destino = esIdioma(pedido) ? pedido : aqui === "en" && base === "" ? guardado() || delNavegador() : aqui;
  if (destino && destino !== aqui) {
    window.location.replace((destino === "es" ? (base === "" ? "es/" : "./") : base === "" ? "./" : "../") + hash);
    return;
  }

  // 3. El selector EN / ES recuerda la elección, para que el Studio y la portada recuerden lo mismo.
  document.addEventListener("click", function (evento) {
    var enlace = evento.target && evento.target.closest ? evento.target.closest("[data-idioma]") : null;
    if (enlace) guardar(enlace.getAttribute("data-idioma"));
  });
})();
