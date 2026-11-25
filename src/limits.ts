/** Global click budget: a token bucket held by the Durable Object. */
export const CLICK_BUDGET_BURST = 30;
export const CLICK_BUDGET_REFILL_MS = 1_000;
/** A finished game stays on the board this long before a click starts the next one. */
export const RESTART_HOLD_MS = 60_000;
/** For this long after a selection, only the client that made it can use, change or clear it. */
export const SELECTION_LOCK_MS = 10_000;
/** A client gets the lock for at most this many selections in a row without a move. */
export const SELECTION_LOCK_STREAK = 3;
/** Life of the Worker's module-scope copy of the board. */
export const BOARD_MEMO_MS = 250;
/** How long a notice stays on the status strip after the event that caused it. */
export const NOTICE_BUSY_MS = 10_000;
export const NOTICE_NO_WRITES_MS = 60_000;
export const NOTICE_BUSY = "Too many clicks. Try again in a minute.";
export const NOTICE_NO_WRITES = "No more moves today. Back at 00:00 UTC.";
