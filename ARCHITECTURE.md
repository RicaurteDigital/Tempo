# Architecture Rulebook

## Layer Enforcement
The project follows a strict layered architecture to maintain pure, predictable boundaries. Imports may only point LEFT in this diagram:

`utils → design → db → services → hooks → components → screens`

### Import Rules Table
Enforced by ESLint `no-restricted-imports`:

| Module        | Allowed Imports From                        | Forbidden Imports From                                  |
|---------------|---------------------------------------------|-------------------------------------------------------|
| **utils**     | None (leaf nodes)                           | `db`, `services`, `hooks`, `components`, `screens`    |
| **design**    | `utils` (e.g. constants)                    | `db`, `services`, `hooks`, `components`, `screens`    |
| **db**        | `utils`                                     | `services`, `hooks`, `components`, `screens`, `design`|
| **services**  | `utils`, `db`, `design`                     | `hooks`, `components`, `screens`                      |
| **hooks**     | `utils`, `db`, `design`, `services`         | `components`, `screens`                               |
| **components**| `utils`, `design`, `hooks`                  | `screens`, `db` (direct queries forbidden)            |
| **screens**   | `utils`, `design`, `hooks`, `components`, `services`| None                                                  |

### Component Purity Contract
Components must be pure. They receive data via props or hooks and consume design tokens via CSS variables.
**No component may query Dexie directly or contain business logic.**
**No component may hardcode a physical dimension (px).** All layout and sizing values must come from `--css-variables` mapped to the token system.

### Token System Contract
Tokens live in Dexie as the source of truth, but are mirrored to `localStorage` on every save.
This allows the `token-loader` script to apply the tokens synchronously to `:root` before the first paint, preventing any Flash of Unstyled Content (FOUC).

### Timer Model
The active session timer is **timestamp-based**. It persists the `{ bucket, startEpochMs }` in IndexedDB settings.
It survives reloads, tab closures, and device restarts. `computeElapsed` calculates the duration dynamically using `Date.now() - startEpochMs` instead of relying on `setInterval` tick accumulation.

### Testing Policy
Modules containing business logic or time/money math (specifically `services/timer.ts` and `services/nudges.ts`) must have unit tests using Vitest.

## File Tree Responsibility
- `src/utils`: Pure helper functions (formatters, constants, crypto, focus handlers).
- `src/design`: CSS design system, tokens definition, and persistence sync logic.
- `src/db`: Dexie database schema, singleton instance, and low-level settings access.
- `src/services`: Core business logic (timer state, nudges calculation, stats).
- `src/hooks`: Preact signals adapters for connecting services to the UI reactively.
- `src/components`: Reusable UI building blocks (pure, props-driven).
- `src/screens`: Top-level compositional views routing different states of the application.
