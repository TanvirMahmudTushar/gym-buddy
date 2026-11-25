import { Component, type ErrorInfo, type ReactNode } from "react"

// If a page breaks while it is drawn, this is shown instead of an empty screen.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="card">
        <h2>Something went wrong</h2>
        <p>This page could not be shown.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </section>
    )
  }
}
