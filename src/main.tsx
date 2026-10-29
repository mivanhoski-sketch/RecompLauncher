import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const render = () =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  import("./devMock").then((m) => m.installDevMock()).then(render);
} else {
  render();
}
