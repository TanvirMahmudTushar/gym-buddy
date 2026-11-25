import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { AuthProvider } from "./context/AuthContext"
import { PlansProvider } from "./context/PlansContext"
import "./index.css"

// The app keeps its page after # (see App.tsx). An address without it, such as /members?filter=active, opens the same
// page: vercel.json answers every path with this app.
if (window.location.pathname !== "/") {
  const page = window.location.pathname.replace(/\/+$/, "")
  window.history.replaceState(null, "", `/#${page}${window.location.search}`)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <PlansProvider>
        <App />
      </PlansProvider>
    </AuthProvider>
  </StrictMode>,
)
