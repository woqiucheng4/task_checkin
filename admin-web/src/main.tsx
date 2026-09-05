import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdminRouter } from "./app/router";
import "tdesign-react/es/style/index.css";
import "./design/tokens.css";
import "./design/global.css";

const root = document.getElementById("root");
if (root === null) throw new Error("缺少应用挂载节点");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdminRouter />
    </BrowserRouter>
  </React.StrictMode>,
);
