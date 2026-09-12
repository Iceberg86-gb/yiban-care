import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { DoctorPage } from "./HomeScreens.jsx";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  location.pathname.startsWith("/doctor/") ? <DoctorPage /> : <App />,
);
