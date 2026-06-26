/**
 * Robust three-state Circuit Breaker for the Audit Logger (issue #771).
 * Supports CLOSED, OPEN, and HALF_OPEN states following Drips Wave standards.
 */

export const CircuitState = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
};

export class AuditCircuitBreaker {
  constructor({
    failureThreshold = 5,
    resetTimeoutMs = 60000,
    halfOpenRequired = 2,
    label = "circuit-breaker",
    onClose = null,
  } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenRequired = halfOpenRequired;
    this.label = label;
    this.onClose = onClose;

    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenSuccesses = 0;
  }

  isOpen(now = Date.now()) {
    if (this.state === CircuitState.OPEN) {
      if (now - this.openedAt >= this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenSuccesses = 0;
        console.info(`[${this.label}] Circuit breaker transitioned to HALF_OPEN — allowing trial requests`);
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.halfOpenRequired) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.halfOpenSuccesses = 0;
        console.info(`[${this.label}] Circuit breaker CLOSED — service recovered`);
        if (typeof this.onClose === "function") {
          this.onClose();
        }
      }
    } else {
      this.failures = 0;
    }
  }

  recordFailure(now = Date.now()) {
    this.failures += 1;
    // In HALF_OPEN, any failure immediately trips back to OPEN.
    // In CLOSED, failureThreshold consecutive failures trip to OPEN.
    if (this.state === CircuitState.HALF_OPEN || this.failures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = now;
      this.halfOpenSuccesses = 0;
      console.warn(
        `[${this.label}] Circuit breaker opened after ${this.failures} failures. DB writes suspended for ${this.resetTimeoutMs}ms.`,
      );
    }
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenSuccesses = 0;
  }
}
