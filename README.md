<h1 align="center">typewriter-ts</h1>

<p align="center">Tiny, dependency-free typewriter effects for JavaScript and TypeScript.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@andreasnicolaou/typewriter-ts"><img src="https://img.shields.io/npm/v/%40andreasnicolaou%2Ftypewriter-ts.svg?style=flat-square&colorB=51C838" alt="NPM version"></a>
  <a href="https://bundlephobia.com/package/@andreasnicolaou/typewriter-ts"><img src="https://img.shields.io/bundlephobia/minzip/%40andreasnicolaou%2Ftypewriter-ts?style=flat-square&color=45cc11" alt="Gzip size"></a>
</p>

![TypeScript](https://img.shields.io/badge/TS-TypeScript-3178c6?logo=typescript&logoColor=white)
![ESLint](https://img.shields.io/badge/linter-eslint-4B32C3.svg?logo=eslint)
![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?logo=prettier)
![Vitest](https://img.shields.io/badge/tested_with-vitest-6E9F18.svg?logo=vitest)
![Maintenance](https://img.shields.io/maintenance/yes/2026)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/andreasnicolaou/typewriter-ts/build.yaml)
![GitHub License](https://img.shields.io/github/license/andreasnicolaou/typewriter-ts)

<p align="center"><b><a href="https://andreasnicolaou.github.io/typewriter-ts/">Live demo</a></b></p>

---

> typewriter-ts animates strings one character at a time. It is dependency-free, Unicode-safe, framework-agnostic, typed, and ships ESM, CommonJS, UMD, minified UMD, and TypeScript declarations.

```ts
import { Typewriter } from '@andreasnicolaou/typewriter-ts';

new Typewriter(document.querySelector('.headline')!, {
  delay: 45,
  cursor: '▋',
})
  .type('Small package. Big personality.')
  .pause(900)
  .delete()
  .type('Works everywhere.')
  .start();
```

- **Dependency-free runtime** — no framework or utility dependencies.
- **Compact bundle** — Bundlewatch checks every JavaScript output.
- **Works everywhere** — render into a DOM element or any `(text) => void` callback, including Node, terminals, canvas, and framework state.
- **Unicode-safe** — text advances one grapheme cluster at a time, so emoji sequences such as 👨‍👩‍👧, flags, and combining accents are never split mid-character.
- **Typed API** — TypeScript declarations are included for both ESM and CommonJS consumers.
- **Multiple builds** — ESM, CommonJS, UMD, and minified UMD.

The default export is the same class, if you prefer it:

```ts
import Typewriter from '@andreasnicolaou/typewriter-ts';
```

## Getting Started

### Installation

```bash
npm install @andreasnicolaou/typewriter-ts
```

### Live demo

The demo is hosted on GitHub Pages:

**[andreasnicolaou.github.io/typewriter-ts](https://andreasnicolaou.github.io/typewriter-ts/)**

You can also serve the project with any static file server. The page uses the local build first and falls back to unpkg, so the playground always matches the checked-out source.

### Browser Usage

```html
<p id="headline"></p>

<script src="https://unpkg.com/@andreasnicolaou/typewriter-ts@latest/dist/index.umd.min.js"></script>
<script>
  const { Typewriter: Writer } = window.typewriter;

  new Writer(document.querySelector('#headline'), { delay: 45, cursor: '▋' }).type('Hello from unpkg!').start();
</script>
```

## API

```ts
const writer = new Typewriter(target, options);
```

`target` can be an `HTMLElement`, an `HTMLInputElement`, an `HTMLTextAreaElement`, another compatible text object, or a `(text: string) => void` callback.

```ts
new Typewriter(document.querySelector('.headline')!);
new Typewriter(document.querySelector('input')!);
new Typewriter((text) => process.stdout.write(`\r${text}`));
```

`Typewriter` is the library's API. Create an instance with `new Typewriter(target, options)`.

### Options

- `delay`: milliseconds between typed characters. Defaults to `40`.
- `deleteDelay`: milliseconds between deleted characters. Defaults to half of `delay`.
- `initial`: text the writer starts from, so content already in the target is kept instead of cleared. Defaults to `''`.
- `jitter`: randomises every character delay by up to this fraction of itself, for a human cadence. Defaults to `0`; `0.3` spreads a 40 ms delay across 28–52 ms. Values above `1` are clamped.
- `cursor`: a string displayed while writing. Defaults to `'|'`; set `false` to disable it.
- `cursorDelay`: milliseconds between cursor blinks. Defaults to `500`.
- `cursorBlink`: whether the cursor blinks. Defaults to `true`; set `false` for a steady cursor.
- `loop`: `true` to repeat indefinitely, or a number for total runs.
- `onLoop(writer, run)`: called after every completed cycle, including the final one.
- `onComplete(writer, runs)`: called once when the final cycle completes. It does not run for an infinite loop.

### Instance Methods

- `type(text, options?)`: queues Unicode-safe text typing. Use `delay` to override the character delay.
- `type(strings, options?)`: queues a string array, deleting between the strings. The last string stays on screen unless the writer loops, so a queue that stops ends on its final phrase. Array options are `delay`, `pause` (milliseconds), and `delete` (defaults to `true`; set `false` to concatenate the strings instead).
- `delete(count?, delay?)`: queues deletion of `count` characters, never more than the text currently holds. Omit the count to remove all of it.
- `pause(ms)`: queues an idle period.
- `start()`: starts or resumes the queue. Once the queue has run to completion it stays idle until you queue more work or call `reset()`.
- `stop()`: pauses after the current character.
- `reset()`: clears text and restarts from the first queued action.
- `destroy()`: stops permanently and releases the pending timer. Later calls no longer render.

The `text` getter returns the current value without the cursor. `running` reports whether a queued run is active.

Characters are counted as grapheme clusters, so `delete(1)` removes a whole 👨‍👩‍👧 rather than one of its code points. Where `Intl.Segmenter` is unavailable, the writer falls back to code points.

### Awaiting a run

`finished` sits at the end of a chain and resolves with the writer, so awaiting a run does not break the chain:

```ts
await new Typewriter(target, { delay: 30 }).type('Fetching results…').start().finished;

const writer = await new Typewriter(target).type('One moment…').start().finished;
writer.delete().type('Ready.').start();
```

Queueing more work hands out a fresh promise for that next run, `destroy()` settles a pending one, and an infinite `loop` never settles. The writer itself is deliberately not `await`-able: a thenable instance would be assimilated by `Promise.resolve`, `Promise.all`, and any `async` function that merely returns it, silently running the animation and handing back something that is no longer a `Typewriter`.

### Rich text

The core deliberately writes plain text; it does not accept HTML or use `innerHTML`. Typing partial markup would produce broken, unsafe DOM states. For styled words, render the writer's text through a callback in your framework or use separate DOM elements for the styled content.

### Accessibility

Animated text is motion, and some readers ask their system not to show it. The library never reads `document`, so the check belongs in your code, next to the rest of your preference handling:

```ts
const target = document.querySelector('.headline')!;
const message = 'Small package. Big personality.';

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  target.textContent = message;
} else {
  new Typewriter(target).type(message).start();
}
```

When a live region announces the target, prefer a steady cursor (`cursorBlink: false`) so assistive technology is not re-notified on every blink.

### Framework integration

typewriter-ts works with React, Vue, Angular, Svelte, and other frameworks because its target is just a text output. Create an instance after the target element has mounted, and call `destroy()` when its owner unmounts.

For server rendering or non-DOM environments, use a callback target. The library never reads `document`, so it is safe to import in Node and on the server.

The writer owns the target's `textContent` while active. Avoid rendering competing text into the same element until the animation is stopped or destroyed. When the element is already rendered with text — from the server, or as a placeholder — pass that text as `initial` so the first frame continues from it instead of clearing it.

### Build formats

| Format       | File                    | Best for                     |
| ------------ | ----------------------- | ---------------------------- |
| ESM          | `dist/index.js`         | Modern bundlers and Node ESM |
| CommonJS     | `dist/index.cjs`        | `require()` compatibility    |
| UMD          | `dist/index.umd.js`     | Plain browser script tags    |
| UMD minified | `dist/index.umd.min.js` | unpkg and other CDNs         |

## Development

```bash
npm install
npm run check
```

`check` runs ESLint, Prettier validation, `tsc --noEmit`, Vitest with its coverage thresholds, the two-stage TypeScript/Rollup build, and Bundlewatch.

## License

typewriter-ts is licensed under the [MIT License](./LICENSE) © Andreas Nicolaou.
