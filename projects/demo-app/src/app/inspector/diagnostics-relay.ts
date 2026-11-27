import type { AppRouterDiagnostic } from 'ngx-urlik';

type Listener = (diagnostic: AppRouterDiagnostic) => void;

// Warnings kept while nothing listens, like in a test without the event log.
const maxWaiting = 50;

/**
 * Passes the router's warnings to the event log. `defineAppRouter()` takes its `diagnostics`
 * option before the app creates the log, so the relay keeps each warning until the log listens.
 * Every warning also goes to the console, as it does without the option.
 */
class DiagnosticsRelay {
  private listener: Listener | undefined;
  private readonly waiting: AppRouterDiagnostic[] = [];

  readonly warn = (diagnostic: AppRouterDiagnostic): void => {
    console.warn(diagnostic.message);
    if (this.listener) {
      this.listener(diagnostic);
    } else if (this.waiting.push(diagnostic) > maxWaiting) {
      this.waiting.shift();
    }
  };

  /** Sends kept and new warnings to `listener`, until the returned function stops it. */
  listen(listener: Listener): () => void {
    this.listener = listener;
    for (const diagnostic of this.waiting.splice(0)) {
      listener(diagnostic);
    }
    return () => {
      if (this.listener === listener) {
        this.listener = undefined;
      }
    };
  }
}

export const diagnosticsRelay = new DiagnosticsRelay();
