import { Component } from "react";

import ErrorPage from "./ErrorPage.jsx";

/** Catches render crashes and shows a friendly page instead of a blank screen. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reference: "" };
  }

  static getDerivedStateFromError(error) {
    // A short time-based reference helps match a report to the console log.
    return { error, reference: `E-${Date.now().toString(36).toUpperCase()}` };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error", this.state.reference, error, info?.componentStack);
  }

  componentDidUpdate(previousProps) {
    // Navigating elsewhere clears the error so the new page can render.
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, reference: "" });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorPage
        fullScreen={this.props.fullScreen}
        kind="crash"
        onRetry={() => window.location.reload()}
        reference={this.state.reference}
      />
    );
  }
}
