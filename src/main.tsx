import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/nunito-sans/latin-700.css";
import "@fontsource/nunito-sans/latin-800.css";
import "./styles.css";
import "./first-minute.css";
import "./journey.css";
import "./decision-ui.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
