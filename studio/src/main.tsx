import { render } from "preact";

import { App } from "./app";
import { iniciarIdioma } from "./i18n/idioma";
import { iniciarTema } from "./preferencias";
import "./estilos/base.css";
import "./estilos/tema-claro.css";
import "./estilos/tema-oscuro.css";
import "./estilos/tablero.css";
import "./estilos/taller.css";
import "./estilos/ajustes.css";

iniciarTema();
iniciarIdioma(); // fija <html lang> antes del primer render
render(<App />, document.getElementById("app")!);
