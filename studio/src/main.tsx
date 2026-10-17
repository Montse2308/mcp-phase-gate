import { render } from "preact";

import { App } from "./app";
import { iniciarModoVisual } from "./preferencias";
import "./estilos/base.css";
import "./estilos/cabina.css";
import "./estilos/sobrio.css";
import "./estilos/tablero.css";
import "./estilos/taller.css";

iniciarModoVisual();
render(<App />, document.getElementById("app")!);
