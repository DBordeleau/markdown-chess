// Token bucket with no I/O. The caller passes the clock, so tests can fake it.

export class Budget {
  private tokens: number;
  private last: number;

  /** Starts full: `burst` tokens, one more every `refillMs`, never above `burst`. */
  constructor(
    private readonly burst: number,
    private readonly refillMs: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }

  /** Spend one token if there is one. */
  take(now: number): boolean {
    // A clock that runs backwards adds nothing.
    const elapsed = Math.max(0, now - this.last);
    this.tokens = Math.min(this.burst, this.tokens + elapsed / this.refillMs);
    this.last = Math.max(this.last, now);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
