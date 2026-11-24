import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { AuthProvider } from "./context/AuthContext"
import { PlansProvider } from "./context/PlansContext"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <PlansProvider>
        <App />
      </PlansProvider>
    </AuthProvider>
  </StrictMode>,
)
