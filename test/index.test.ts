import { afterEach, describe, expect, it, vi } from 'vitest';
import TypewriterDefault, { Typewriter } from '../src/index';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Typewriter', () => {
  it('creates a class instance', () => {
    const target = document.createElement('p');
    const instance = new Typewriter(target);

    expect(instance).toBeInstanceOf(Typewriter);
    expect(instance.text).toBe('');
    expect(instance.running).toBe(false);
    expect(TypewriterDefault).toBe(Typewriter);
  });

  it('blinks an active cursor and hides it when stopped', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    const writer = new Typewriter(target, { cursorDelay: 20 }).type('a').pause(100).start();

    expect(target.textContent).toBe('a|');
    vi.advanceTimersByTime(20);
    expect(target.textContent).toBe('a');
    writer.stop();
    expect(target.textContent).toBe('a');
  });

  it('can keep an active cursor steady', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    new Typewriter(target, { cursorBlink: false, cursorDelay: 20 }).type('a').pause(100).start();

    vi.advanceTimersByTime(20);
    expect(target.textContent).toBe('a|');
  });

  it('types Unicode text into a DOM target and removes its active cursor', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    const writer = new Typewriter(target, { delay: 1, cursor: '|' }).type('Hi 👋').start();

    expect(target.textContent).toBe('H|');
    vi.runAllTimers();

    expect(writer.text).toBe('Hi 👋');
    expect(target.textContent).toBe('Hi 👋');
    expect(writer.running).toBe(false);
  });

  it('queues pauses and deletion with custom delays through a callback', () => {
    vi.useFakeTimers();
    const output: string[] = [];
    const writer = new Typewriter((text) => output.push(text), {
      delay: 10,
      deleteDelay: 3,
      cursor: false,
    })
      .type('abc', { delay: 2 })
      .pause(5)
      .delete(2, 1)
      .start();

    vi.runAllTimers();

    expect(writer.text).toBe('a');
    expect(output).toContain('abc');
    expect(output).toContain('a');
  });

  it('skips empty actions, rotates string arrays, and can delete all current text', () => {
    vi.useFakeTimers();
    const target = { textContent: '' };
    const writer = new Typewriter(target, { delay: 0, deleteDelay: 0 }).type('').delete(0).type('ok').delete().start();

    vi.runAllTimers();

    expect(writer.text).toBe('');
    expect(target.textContent).toBe('');

    const output: string[] = [];
    new Typewriter((text) => output.push(text), { delay: 0, cursor: false }).type(['one', 'two'], { pause: 1 }).start();
    vi.runAllTimers();
    expect(output).toContain('one');
    expect(output).toContain('two');

    const joined = new Typewriter(() => {}, { delay: 0, cursor: false }).type(['a', 'b'], { delete: false }).start();
    vi.runAllTimers();
    expect(joined.text).toBe('ab');
  });

  it('writes to input and textarea targets', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');

    new Typewriter(input, { delay: 0, cursor: false }).type('input').start();
    new Typewriter(textarea, { delay: 0, cursor: false }).type('textarea').start();
    vi.runAllTimers();

    expect(input.value).toBe('input');
    expect(textarea.value).toBe('textarea');
  });

  it('stops, resumes, resets, and destroys safely', () => {
    vi.useFakeTimers();
    const output: string[] = [];
    const writer = new Typewriter((text) => output.push(text), { delay: 10 }).type('abc').start();

    writer.start();
    writer.stop();
    expect(writer.text).toBe('a');
    expect(writer.running).toBe(false);

    writer.start();
    vi.runAllTimers();
    expect(writer.text).toBe('abc');

    writer.reset();
    vi.runAllTimers();
    expect(writer.text).toBe('abc');

    writer.destroy();
    writer.start();
    expect(writer.running).toBe(false);
    expect(output.at(-1)).toBe('abc');
  });

  it('supports finite and infinite loops', () => {
    vi.useFakeTimers();
    const onLoop = vi.fn();
    const onComplete = vi.fn();
    const finite = new Typewriter(() => {}, {
      delay: 1,
      loop: 2,
      onLoop,
      onComplete,
    })
      .type('xx')
      .delete()
      .start();

    vi.runAllTimers();
    expect(finite.text).toBe('');
    expect(finite.running).toBe(false);
    expect(onLoop).toHaveBeenNthCalledWith(1, finite, 1);
    expect(onLoop).toHaveBeenNthCalledWith(2, finite, 2);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenLastCalledWith(finite, 2);

    const stoppedByLoop = new Typewriter(() => {}, {
      delay: 1,
      loop: true,
      onLoop: (writer) => writer.stop(),
    })
      .type('x')
      .start();
    vi.runAllTimers();
    expect(stoppedByLoop.running).toBe(false);

    const infiniteComplete = vi.fn();
    const looping = new Typewriter(() => {}, {
      delay: 1,
      loop: true,
      onComplete: infiniteComplete,
    })
      .type('x')
      .delete()
      .start();

    vi.advanceTimersByTime(10);
    expect(looping.running).toBe(true);
    expect(infiniteComplete).not.toHaveBeenCalled();
    looping.stop();
  });

  it('defensively ignores stale work after stopping', () => {
    vi.useFakeTimers();
    const writer = new Typewriter(() => {}, { delay: 1 }).type('ab').start();
    const internal = writer as unknown as {
      next: () => void;
      _resume?: () => void;
    };

    writer.stop();
    internal.next();
    internal._resume?.();
    new Typewriter(() => {}).stop();

    expect(writer.text).toBe('a');
  });

  it('normalizes negative delays and accepts a disabled cursor', () => {
    vi.useFakeTimers();
    const output: string[] = [];
    const writer = new Typewriter((text) => output.push(text), {
      delay: -1,
      cursor: false,
    });

    writer.type('a').start();
    vi.runAllTimers();

    expect(writer.text).toBe('a');
    expect(output.at(-1)).toBe('a');
  });

  it('falls back to the defaults for delays that are not finite', () => {
    vi.useFakeTimers();
    const writer = new Typewriter(() => {}, {
      delay: Number.NaN,
      cursorDelay: Number.NaN,
      cursor: false,
    })
      .type('ab')
      .start();

    expect(writer.text).toBe('a');
    vi.advanceTimersByTime(39);
    expect(writer.text).toBe('a');
    vi.advanceTimersByTime(1);
    expect(writer.text).toBe('ab');
  });

  it('keeps a steady cursor when the blink delay is zero', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    new Typewriter(target, { delay: 0, cursorDelay: -5 }).type('a').pause(100).start();

    vi.advanceTimersByTime(50);
    expect(target.textContent).toBe('a|');
  });

  it('deletes an exact count and never more than the current text', () => {
    vi.useFakeTimers();
    const kept = new Typewriter(() => {}, { delay: 0, deleteDelay: 0, cursor: false }).type('abc').delete(0).start();
    vi.runAllTimers();
    expect(kept.text).toBe('abc');

    const trimmed = new Typewriter(() => {}, { delay: 0, deleteDelay: 0, cursor: false })
      .type('abc')
      .delete(2.7)
      .start();
    vi.runAllTimers();
    expect(trimmed.text).toBe('a');

    const emptied = new Typewriter(() => {}, { delay: 0, deleteDelay: 0, cursor: false })
      .type('ab')
      .delete(10)
      .delete(Number.NaN)
      .start();
    vi.runAllTimers();
    expect(emptied.text).toBe('');
  });

  it('types and deletes grapheme clusters as single characters', () => {
    vi.useFakeTimers();
    const output: string[] = [];
    const family = '👨‍👩‍👧';
    const writer = new Typewriter((text) => output.push(text), {
      delay: 1,
      deleteDelay: 1,
      cursor: false,
    })
      .type(`é${family}`)
      .delete(1)
      .start();

    vi.runAllTimers();

    const states = output.filter((value, at) => value !== output[at - 1]);
    expect(states).toEqual(['', 'é', `é${family}`, 'é']);
    expect(writer.text).toBe('é');
  });

  it('splits by code point where Intl.Segmenter is unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Intl', Object.create(Intl, { Segmenter: { value: undefined } }));
    vi.resetModules();
    const { Typewriter: Fallback } = await import('../src/index');
    vi.unstubAllGlobals();

    const output: string[] = [];
    const writer = new Fallback((text) => output.push(text), {
      delay: 0,
      deleteDelay: 0,
      cursor: false,
    })
      .type('a👋')
      .delete(1)
      .start();

    vi.runAllTimers();

    expect(writer.text).toBe('a');
    expect(output).toContain('a👋');
  });

  it('discards stale in-flight work when reset mid-action', () => {
    vi.useFakeTimers();
    const writer = new Typewriter(() => {}, { delay: 10, cursor: false }).type('abcdef').start();

    writer.stop();
    expect(writer.text).toBe('a');

    writer.reset();
    vi.runAllTimers();
    expect(writer.text).toBe('abcdef');
  });

  it('abandons the old run when a target callback resets mid-character', () => {
    vi.useFakeTimers();
    let reset = false;
    const writer: Typewriter = new Typewriter(
      (value) => {
        if (value === 'ab' && !reset) {
          reset = true;
          writer.reset();
        }
      },
      { delay: 1, cursor: false }
    );

    writer.type('abcd').start();
    vi.runAllTimers();

    expect(reset).toBe(true);
    expect(writer.text).toBe('abcd');
    expect(writer.running).toBe(false);
  });

  it('abandons the old run when a loop callback resets the writer', () => {
    vi.useFakeTimers();
    let reset = false;
    const writer = new Typewriter(() => {}, {
      delay: 1,
      cursor: false,
      onLoop: (instance) => {
        if (reset) return;
        reset = true;
        instance.reset();
      },
    });

    writer.type('ab').start();
    vi.runAllTimers();

    expect(reset).toBe(true);
    expect(writer.text).toBe('ab');
    expect(writer.running).toBe(false);
  });

  it('ignores reset once destroyed', () => {
    vi.useFakeTimers();
    const target = document.createElement('p');
    const writer = new Typewriter(target, { delay: 0, cursor: false }).type('done').start();

    vi.runAllTimers();
    writer.destroy();
    writer.reset();

    expect(writer.text).toBe('done');
    expect(writer.running).toBe(false);
    expect(target.textContent).toBe('done');
  });

  it('completes once and reopens only when more work is queued', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const writer = new Typewriter(() => {}, { delay: 0, cursor: false, onComplete }).type('a').start();

    vi.runAllTimers();
    expect(onComplete).toHaveBeenCalledOnce();

    writer.start();
    vi.runAllTimers();
    expect(writer.running).toBe(false);
    expect(onComplete).toHaveBeenCalledOnce();

    writer.type('b').start();
    vi.runAllTimers();
    expect(writer.text).toBe('ab');
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith(writer, 2);
  });

  it('starts from existing text rather than clearing the target', () => {
    vi.useFakeTimers();
    const renders: string[] = [];
    const writer = new Typewriter((text) => renders.push(text), { initial: 'Hello', delay: 1, cursor: false });

    writer.type(' world').start();
    expect(renders[0]).toBe('Hello');

    vi.runAllTimers();
    expect(writer.text).toBe('Hello world');

    const target = { textContent: 'Hello' };
    new Typewriter(target, { initial: 'Hello', delay: 0, cursor: false }).type('!').start();
    vi.runAllTimers();
    expect(target.textContent).toBe('Hello!');
  });

  it('deletes against the starting text and restores it on reset', () => {
    vi.useFakeTimers();
    const trimmed = new Typewriter(() => {}, { initial: 'seed', delay: 0, deleteDelay: 0, cursor: false })
      .delete(2)
      .start();

    vi.runAllTimers();
    expect(trimmed.text).toBe('se');

    const writer = new Typewriter(() => {}, { initial: 'seed', delay: 1, cursor: false }).pause(100).type('!').start();
    vi.runAllTimers();
    expect(writer.text).toBe('seed!');

    writer.reset();
    expect(writer.text).toBe('seed');
    vi.runAllTimers();
    expect(writer.text).toBe('seed!');
  });

  it('ends a rotating array on its last string unless the writer loops', () => {
    vi.useFakeTimers();
    const stops = new Typewriter(() => {}, { delay: 0, deleteDelay: 0, cursor: false })
      .type(['one', 'two'], { pause: 1 })
      .start();
    vi.runAllTimers();
    expect(stops.text).toBe('two');

    const looping = new Typewriter(() => {}, { delay: 0, deleteDelay: 0, cursor: false, loop: 2 })
      .type(['one', 'two'])
      .start();
    vi.runAllTimers();
    expect(looping.text).toBe('');

    const joined = new Typewriter(() => {}, { delay: 0, deleteDelay: 0, cursor: false })
      .type(['a', 'b'], { delete: false })
      .start();
    vi.runAllTimers();
    expect(joined.text).toBe('ab');
  });

  it('resolves the finished promise for each run and on destroy', async () => {
    vi.useFakeTimers();
    const writer = new Typewriter(() => {}, { delay: 1, cursor: false }).type('ab').start();
    const first = writer.finished;

    expect(writer.finished).toBe(first);
    vi.runAllTimers();
    await expect(first).resolves.toBe(writer);

    const afterDone = writer.finished;
    await expect(afterDone).resolves.toBe(writer);

    writer.type('c').start();
    const second = writer.finished;
    expect(second).not.toBe(afterDone);
    vi.runAllTimers();
    await expect(second).resolves.toBe(writer);
    expect(writer.text).toBe('abc');

    const abandoned = new Typewriter(() => {}, { delay: 10, cursor: false }).type('never').start();
    const pending = abandoned.finished;
    abandoned.destroy();
    await expect(pending).resolves.toBe(abandoned);
  });

  it('keeps an awaited run pending while more work is queued', async () => {
    vi.useFakeTimers();
    const writer = new Typewriter(() => {}, { delay: 1, cursor: false }).type('abc').start();
    const settled = vi.fn();
    const pending = writer.finished;
    void pending.then(settled);

    expect(writer.running).toBe(true);
    writer.type('d');
    expect(writer.finished).toBe(pending);
    expect(settled).not.toHaveBeenCalled();

    vi.runAllTimers();
    await pending;
    expect(settled).toHaveBeenCalledOnce();
    expect(writer.text).toBe('abcd');
  });

  it('varies each delay when jitter is set', () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    const slowest = new Typewriter(() => {}, { delay: 100, jitter: 0.5, cursor: false }).type('ab').start();

    expect(slowest.text).toBe('a');
    vi.advanceTimersByTime(149);
    expect(slowest.text).toBe('a');
    vi.advanceTimersByTime(1);
    expect(slowest.text).toBe('ab');
    expect(random).toHaveBeenCalled();

    random.mockReturnValue(0);
    const fastest = new Typewriter(() => {}, { delay: 100, jitter: 0.5, cursor: false }).type('ab').start();
    vi.advanceTimersByTime(49);
    expect(fastest.text).toBe('a');
    vi.advanceTimersByTime(1);
    expect(fastest.text).toBe('ab');
  });

  it('clamps jitter to the full delay', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const writer = new Typewriter(() => {}, { delay: 100, jitter: 9, cursor: false }).type('ab').start();

    vi.advanceTimersByTime(199);
    expect(writer.text).toBe('a');
    vi.advanceTimersByTime(1);
    expect(writer.text).toBe('ab');
  });
});
