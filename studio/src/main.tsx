import { render } from "preact";

import { App } from "./app";
import { iniciarIdioma } from "./i18n/idioma";
import { iniciarModoVisual } from "./preferencias";
import "./estilos/base.css";
import "./estilos/cabina.css";
import "./estilos/sobrio.css";
import "./estilos/tablero.css";
import "./estilos/taller.css";

iniciarModoVisual();
iniciarIdioma(); // fija <html lang> antes del primer render
render(<App />, document.getElementById("app")!);
