# Contributing to SignalDock

Thanks for helping improve SignalDock.

## Principles that should not regress

Contributions should preserve the project's core boundaries:

1. **Local-first processing.** Do not introduce hidden log uploads, analytics, telemetry or mandatory remote services.
2. **Evidence over inference.** Do not fabricate topology, duration, health or causality when the input data does not contain enough evidence.
3. **Bounded resource use.** Large-file and IndexedDB paths need explicit limits and safe fallbacks.
4. **Safe rendering.** User-controlled log content must remain text, not executable HTML.
5. **No accidental external runtime dependencies.** Keep the application deployable as static local files.

## Local development

```bash
git clone https://github.com/bren-wp/SignalDock.git
cd SignalDock
python3 -m http.server 8080
```

Open `http://localhost:8080/`.

## Before opening a pull request

Run the same quality gate as CI:

```bash
find . -maxdepth 1 -name '*.js' -print0 | xargs -0 -n1 node --check
for test in tests/*.mjs; do TERM=xterm node "$test" || exit 1; done
```

For parser changes, add a focused synthetic fixture/test. For query changes, verify both worker and main-thread semantics. For UI changes, preserve keyboard access and responsive behavior.

## Pull requests

Keep each PR focused. Explain what changed, why it is safe for local-first/privacy guarantees, and which tests cover the change. Avoid committing real production logs or secrets.
