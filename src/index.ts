/** A DOM node, form field, callback, or compatible text output object. */
export type TypewriterTarget = { textContent: string | null } | { value: string } | ((value: string) => void);

export interface TypewriterOptions {
  /** Milliseconds between typed characters. Default: 40. */
  delay?: number;
  /** Milliseconds between deleted characters. Default: `delay / 2`. */
  deleteDelay?: number;
  /** Text the writer starts from, so existing content is kept. Default: `""`. */
  initial?: string;
  /** Randomises every character delay by up to this fraction, for a human cadence. Default: `0`. */
  jitter?: number;
  /** Appended while the writer is active. Default: `"|"`. */
  cursor?: string | false;
  /** Milliseconds between cursor blinks. Default: `500`. */
  cursorDelay?: number;
  /** Whether the active cursor blinks. Default: `true`. */
  cursorBlink?: boolean;
  /** Repeat queued actions forever, or a finite number of total runs. */
  loop?: boolean | number;
  /** Called after every completed cycle, including the final one. */
  onLoop?: (writer: Typewriter, run: number) => void;
  /** Called once when the final queued cycle completes. */
  onComplete?: (writer: Typewriter, runs: number) => void;
}

export interface TypewriterTypeOptions {
  /** Milliseconds between typed characters. */
  delay?: number;
  /** Milliseconds to pause after each string. Default: `0`. */
  pause?: number;
  /** Delete each string before continuing. Default: `true`. */
  delete?: boolean;
}

/** A queued step: typed text, a deleted character count, or an idle period. */
type Action =
  | readonly [kind: 0, text: string, delay?: number]
  | readonly [kind: 1, count: number, delay?: number]
  | readonly [kind: 2, ms: number, delay?: number];

/** Deletes every remaining character. */
const ALL = -1;

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : undefined;

/** Splits text into user-perceived characters so emoji and accents stay whole. */
const split = (text: string): string[] =>
  segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);

/** Clamps a millisecond value, falling back when it is missing or not finite. */
const time = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;

/**
 * A small, chainable typewriter with no DOM dependency. Use a callback target
 * for Node, CLIs, canvas renderers, web components, or any other text output.
 *
 * @author Andreas Nicolaou
 */
export class Typewriter {
  private readonly actions: Action[] = [];
  private readonly write: (value: string) => void;
  private readonly base: number;
  private readonly deleteBase: number;
  private readonly initial: string;
  private readonly jitter: number;
  private readonly cursor: string;
  private readonly cursorDelay: number;
  private readonly cursorBlink: boolean;
  private value: string;
  private index = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cursorTimer: ReturnType<typeof setInterval> | undefined;
  private _resume: (() => void) | undefined;
  private _settle: (() => void) | undefined;
  private _pending: Promise<this> | undefined;
  private _epoch = 0;
  private cursorVisible = false;
  private active = false;
  private dead = false;
  private done = false;
  private runs = 0;

  /** Creates an effect for a text target or rendering callback. */
  public constructor(
    target: TypewriterTarget,
    private readonly options: TypewriterOptions = {}
  ) {
    if (typeof target === 'function') {
      this.write = target;
    } else if ('value' in target) {
      this.write = (value: string) => (target.value = value);
    } else {
      this.write = (value: string) => (target.textContent = value);
    }
    this.base = time(options.delay, 40);
    this.deleteBase = time(options.deleteDelay, this.base / 2);
    this.value = this.initial = options.initial ?? '';
    this.jitter = Math.min(1, time(options.jitter, 0));
    this.cursor = options.cursor === false ? '' : (options.cursor ?? '|');
    this.cursorDelay = time(options.cursorDelay, 500);
    this.cursorBlink = options.cursorBlink ?? true;
  }

  /** Queue one string or an array of strings that rotates by default. */
  public type(value: string | readonly string[], options: TypewriterTypeOptions = {}): this {
    if (typeof value === 'string') {
      this.queue([0, value, options.delay]);
      return this;
    }

    const deleteText = options.delete ?? true;
    // A queue that stops rather than loops reads better ending on its last string.
    const keepLast = !this.options.loop;
    const last = value.length - 1;
    for (let at = 0; at <= last; at += 1) {
      this.queue([0, value[at]!, options.delay]);
      if (at === last && keepLast) break;
      if (options.pause) this.pause(options.pause);
      if (deleteText) this.delete();
    }
    return this;
  }

  /** Queue deletion of `count` characters; omitting it deletes all text. */
  public delete(count?: number, delay?: number): this {
    const amount = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : ALL;
    this.queue([1, amount, delay]);
    return this;
  }

  /** Queue an idle period. */
  public pause(ms: number): this {
    this.queue([2, ms]);
    return this;
  }

  /** Start or resume the queue. */
  public start(): this {
    if (this.dead || this.active || this.done) return this;
    this.active = true;
    this.cursorVisible = true;
    this.paint();
    this.blink();
    const resume = this._resume;
    this._resume = undefined;
    (resume ?? (() => this.next()))();
    return this;
  }

  /** Pause after the current character. */
  public stop(): this {
    this.active = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.stopBlink();
    this.paint();
    return this;
  }

  /** Restore the starting text and restart from the first queued action. */
  public reset(): this {
    if (this.dead) return this;
    this.stop();
    this._resume = undefined;
    this._epoch += 1;
    this.value = this.initial;
    this.index = this.runs = 0;
    this.done = false;
    this.paint();
    return this.start();
  }

  /** Remove the pending timer and prevent further rendering. */
  public destroy(): void {
    this.stop();
    this._resume = undefined;
    this.dead = true;
    this.settle();
  }

  /** Current text, excluding the cursor. */
  public get text(): string {
    return this.value;
  }

  /** Whether a queued run is in progress. */
  public get running(): boolean {
    return this.active;
  }

  /**
   * Resolves when the queued work completes or the writer is destroyed. A new
   * promise is handed out once more work is queued. An infinite loop never settles.
   */
  public get finished(): Promise<this> {
    this._pending ??= this.done
      ? Promise.resolve(this)
      : new Promise<this>((resolve) => {
          this._settle = () => resolve(this);
        });
    return this._pending;
  }

  /** Appends an action and reopens a queue that already ran to completion. */
  private queue(action: Action): void {
    this.actions.push(action);
    this.done = false;
    // A settled promise must not be handed out for work that has not run yet.
    if (!this._settle) this._pending = undefined;
  }

  /** Resolves anyone awaiting this run, and frees the promise for the next one. */
  private settle(): void {
    const resolve = this._settle;
    this._settle = undefined;
    this._pending = undefined;
    resolve?.();
  }

  private paint(): void {
    this.write(this.value + (this.active && this.cursorVisible ? this.cursor : ''));
  }

  /** Spreads a delay around its nominal value so the cadence is not mechanical. */
  private vary(gap: number): number {
    return this.jitter === 0 ? gap : gap * (1 + (Math.random() * 2 - 1) * this.jitter);
  }

  private blink(): void {
    if (!this.cursor || !this.cursorBlink || this.cursorDelay === 0) return;
    this.cursorTimer = setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      this.paint();
    }, this.cursorDelay);
  }

  private stopBlink(): void {
    if (this.cursorTimer !== undefined) clearInterval(this.cursorTimer);
    this.cursorTimer = undefined;
    this.cursorVisible = false;
  }

  private next(): void {
    if (!this.active || this.dead) return;
    const run = this._epoch;
    const action = this.actions[this.index];
    if (!action) {
      this.runs += 1;
      this.options.onLoop?.(this, this.runs);
      if (!this.active || this.dead || run !== this._epoch) return;
      const loop = this.options.loop;
      if (loop === true || (typeof loop === 'number' && this.runs < loop)) {
        this.index = 0;
        this.timer = setTimeout(() => this.next(), 0);
        return;
      }
      this.active = false;
      this.done = true;
      this.stopBlink();
      this.paint();
      this.options.onComplete?.(this, this.runs);
      this.settle();
      return;
    }

    this.index += 1;
    const [kind, payload, speed] = action;
    if (kind === 2) {
      const afterPause = (): void => {
        this._resume = undefined;
        this.next();
      };
      this._resume = afterPause;
      this.timer = setTimeout(afterPause, time(payload, 0));
      return;
    }

    const deleting = kind === 1;
    let chars: string[];
    let total: number;
    if (kind === 1) {
      chars = split(this.value);
      total = payload === ALL ? chars.length : Math.min(payload, chars.length);
    } else {
      chars = split(payload);
      total = chars.length;
    }
    if (total === 0) {
      this.next();
      return;
    }

    const gap = time(speed, deleting ? this.deleteBase : this.base);
    let position = 0;
    const tick = (): void => {
      if (!this.active || this.dead || run !== this._epoch) return;
      if (deleting) {
        chars.pop();
        this.value = chars.join('');
      } else {
        this.value += chars[position]!;
      }
      position += 1;
      this.paint();
      // A target callback may have reset the writer while painting; that run owns the state now.
      if (this.dead || run !== this._epoch) return;
      if (position < total) {
        this._resume = tick;
        this.timer = setTimeout(() => {
          this._resume = undefined;
          tick();
        }, this.vary(gap));
        return;
      }
      this._resume = undefined;
      this.next();
    };
    tick();
  }
}

export default Typewriter;
