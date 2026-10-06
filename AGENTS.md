# AGENTS GUIDE
Purpose: give autonomous agents enough context to extend `mqtt-bridge` safely, consistently, and quickly.
Keep environment secrets private, prefer deterministic commands, and document anything surprising.

## PROJECT ANALYSIS (2026-10-06)
- This is a long-running TypeScript/CommonJS process, not an HTTP server. Socket.IO telemetry drives MQTT publishing and automatic Tesla charging-current commands.
- Dependencies include Socket.IO client 2.x, MQTT 5.x, Axios, JSDOM, dotenv, fs-extra, and Nodemailer. Check protocol compatibility before upgrading Socket.IO.
- TypeScript targets ES6 with `strict`, `esModuleInterop`, `resolveJsonModule`, and `skipLibCheck`; `rootDir` is the repository root, so the entrypoint compiles to `dist/src/index.js`.
- Validation on this date: `npm run build` passed. No automated test runner, lint, formatter, or CI workflow is present. A successful build does not verify network integrations or charging safety.
- README currently contains video links and screenshots, not setup instructions or quota documentation. Use code and this guide for current behavior.
- Existing local edits may be in progress. Inspect `git status --short` before editing and preserve them; this analysis updates documentation only.

## EVENT FLOW AND PAYLOAD CONTRACT
1. Subscribe to `AppConfig.SOCKET_IO_EVENT`, sanitize `data.deviceName` by replacing non-alphanumeric characters with `_`, and skip missing device names.
2. Only `Huawei_SUN2000_10K_LC0` receives Tesla enrichment. Fetch TeslaMate HTML and Wall Connector `vitals` sequentially, then attach `tesla.wallCharge`, `tesla.teslaMate`, and `tesla.fleetApiCounter`.
3. For a charging Tesla with an open Wall Connector contactor, synthesize charging state and estimate mobile-charger current from TeslaMate kW using 230V. Both service results must exist for this fallback.
4. Store the latest payload, then apply the per-device publish throttle. Enrichment happens before the throttle, so throttled inverter events still make HTTP requests.
5. `LVTOPSUN_BATTERY` updates shared discharge power from `abs(deviceState.energy)` when discharging below 90% SOC. For finite numeric SOC within 0-100, notify once below `LOW_BATTERY_SOC_THRESHOLD` (currently 25% in `src/index.ts`); re-arm at or above that threshold. Notification state is per-device and in memory, so midnight does not reset it, but a process restart does. Repeated crossings around the threshold can generate new alerts.
6. Run solar charging control for the Huawei device unless TeslaMate indicates charging away from home, then publish JSON with QoS 1 and retain enabled.
- Required telemetry fields include `deviceName`, inverter `deviceState.grid_power` / `pv_power` (treated as kW), and battery `deviceState.isDischarging` / `soc` / `energy` (energy is treated as W in control). Verify upstream units before changing calculations.
- Throttling is event-driven, not a trailing-edge debounce: there is no timer to publish the final suppressed payload. Publish timestamps are recorded after processing, without waiting for publish acknowledgement.

## CHARGING POLICY AS IMPLEMENTED
- Control is called by telemetry, not an interval. State is module-scoped and assumes one vehicle/inverter.
- Minimum current is 8A on Bangkok weekdays and 10A on weekends. Maximum is 13A for detected mobile charging and 16A otherwise; older comments and initial variable values do not describe these effective limits.
- First control call loads persisted Fleet state, synchronizes current, sends a notification, and returns without issuing a command.
- Samples use `max(abs(grid_power) * 1000, batteryDischargePower)`. Grid sign is discarded; do not interpret this as measured signed solar surplus.
- After the adjustment delay, commands require current >=5A, a closed contactor, positive PV, the charge window, enough samples, changed amps, and remaining quota. SOC/charge limit are logged, not additional stop conditions.
- Import above the threshold reduces current by 1-6A depending on magnitude; average power below the zero threshold increases it by 1A. Values are clamped to effective limits.
- `MAX_DAILY_COMMANDS` is 330 in `ChargeControl.ts`; pricing comments are historical assumptions, not verified current Tesla pricing. This quota gates only the controller's `setCurrent`, not every exported Fleet command.
- Current config defaults: `DEBOUNCE_MS=3000`, `ADJUST_DELAY=40000` (milliseconds), `GRID_AVG_SAMPLES=10`, `IMPORT_THRESHOLD=130`, `ZERO_THRESHOLD=65` (watts), `CHARGE_HOUR_START=10`, `CHARGE_HOUR_END=16`, `HOME_RADIUS_KM=0.2`.

## KNOWN LIMITATIONS TO ACCOUNT FOR
- Async Socket.IO callbacks can overlap; there is no per-device processing lock or outer handler catch. Shared control state, command quota checks, and publish throttling can race.
- Tesla services return `null` on fetch failures, but charging destructures nested values and catches resulting errors. Invalid `HOME_LOCATION` can throw outside that control catch. Missing/zero coordinates currently make `isAtHome` return true.
- `getValidToken` uses a flag to prevent duplicate refreshes, but concurrent callers do not await the active refresh and may receive the previous token. Token writes are read/modify/write operations without a lock or atomic replacement.
- Refresh logs a raw refresh token in `TeslaFleetApi.ts`; remove/redact that log when working on token handling. Never copy token values into documentation or diagnostics.
- Fleet sets a global Axios HTTPS agent with `rejectUnauthorized: false`; importing it affects other Axios consumers too. Do not propagate this TLS bypass into new code.
- The controller increments its in-memory counter before the command but persists it only on success. Failed attempts may be forgotten after restart. Daily reset uses host-local dates, and its running flag is cleared only after later charging/window checks.
- Notifications announce a charging change before the API result. Telegram/LINE catch and log Axios errors; raw error objects can contain credentials. Log sanitized context in new code.
- `EmailService.ts` has hardcoded SMTP credentials and sender, reads only SMTP host/port from env, and is not imported by the bridge. Treat embedded credentials as sensitive, regardless of whether they appear to be examples; never reproduce or use them.
- Config is not validated at startup; numeric env values may become NaN or invalid sample counts. Validate inputs when extending configuration.
- Shutdown handles SIGINT only, immediately exits, and does not await MQTT flushing or in-flight commands; SIGTERM is not handled.
- No `.dockerignore` exists. `COPY . .` can put local env/token files into builder layers. `.gitignore` ignores `.env.local` and `token.json`, but not all `.env*` files.

## BUILD / LINT / TEST COMMANDS
- Install dependencies: `npm install`
- Start in watch mode (ts-node + nodemon): `npm start`
- Production build: `npm run build` (outputs to `dist/` per `tsconfig.json`)
- Run compiled app locally: `node dist/src/index.js`
- Run placeholder tests: `npm test` (currently exits with code 1 because tests are not defined—create Jest/Vitest suites before relying on this)
- Run a single future test: `npm test -- path/to/spec.ts` once a real runner is wired up; prefer colocated test files under `src/**/*.spec.ts`
- Formatters/lints are not configured; if you introduce ESLint/Prettier add scripts named `lint` / `format` and document their usage here.
- Docker build: `docker build -t mqtt-bridge .`
- Docker Compose (mounts persistent token): `docker compose up --build`
- Standalone regional routing: manually place a PBF in `OSRM_DATA_DIR` (default `./data/osrm-bangkok`) named `${OSRM_MAP_NAME}.osm.pbf` (default stem `thailand-latest`, retained for compatibility with the earlier wget command). Run `docker compose -f docker-compose.osrm.yml up -d`; prepares car-profile MLD data with 2 threads and serves on host port 3002 by default. The marker is `${OSRM_MAP_NAME}.ready`; remove it after replacing a map. Coverage depends on the downloaded extract, not its filename. See README. This stack does not download maps or alter bridge distance calculation.

## RUNTIME & CONFIG BASICS
- Config lives in `.env.local` (preferred) or `.env`; loader logs which file is used (`src/constants/Constants.ts`).
- Bridge vars: `SOCKET_IO_URL`, `SOCKET_IO_EVENT`, `MQTT_BROKER`, `MQTT_TOPIC_BASE`; optional broker auth: `MQTT_USERNAME`, `MQTT_PASSWORD`.
- Tesla enrichment/control vars: `TESLAMATE_URL`, `TESLA_WALLCONNECTOR_URL`, `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_OAUTH_BASE`, `TESLA_API_BASE`, `TESLA_PROXY_BASE`, `TESLA_VIN`, and `HOME_LOCATION` (`lat,lon`). Telegram uses `TELEGRAM_API_KEY` / `TELEGRAM_CHAT_ID`; LINE uses `LINE_TOKEN` / `LINE_SENDER_ID` and is not called by the current bridge flow.
- Env files and `data/token.json` resolve relative to `process.cwd()`; run from the repository root. Existing process env values take precedence over dotenv defaults.
- `data/token.json` must exist before invoking Tesla Fleet APIs; it stores OAuth tokens plus the daily command counter.
- Never commit `.env*` or `data/token.json`. Compose has an active `env_file: .env.local` and a commented configuration containing credential-like values; never assume these are fake or reuse them.
- Persisted Fleet fields include `access_token`, `refresh_token`, `expires_at` (epoch milliseconds), `dailyCounter`, and `lastUpdate` (ISO date); refresh also writes `expires_in` and `id_token`. Do not open real token files for routine analysis/tests.
- MQTT topics follow `MQTT_TOPIC_BASE/${deviceKey}/state`; publishing is active with `{ qos: 1, retain: true }` in `src/index.ts`.
- `DEBOUNCE_MS` (default 3000) throttles per-device MQTT publishes.

## REPO LAYOUT REFERENCE
- `src/index.ts`: MQTT + Socket.IO bridge entrypoint.
- `src/constants/Constants.ts`: env loader and `AppConfig` definition.
- `src/services/Wallconnector.ts`: pulls Wall Connector vitals.
- `src/services/TeslaMate.ts`: scrapes TeslaMate UI, returning structured data.
- TeslaMate `distanceFromHomeKm` retains its last in-memory distance without any calculation or OSRM call when parked or speed is unavailable (null until first valid moving result after restart); only finite `speed > 0` prefers OSRM road distance (meters converted to kilometers), falling back to `getDistanceFromHomeKm` on timeout, errors, missing routes, or unavailable road coverage. `OSRM_URL` defaults to `http://localhost:3002`, timeout to 2000ms, and maximum snapping distance to 200m (`OSRM_MAX_SNAP_DISTANCE_METERS`). This snapping limit detects unavailable coverage, not an exact map polygon: points near an extract boundary may still snap inside. Invalid coordinates preserve the cached distance, initially null. Other telemetry and lat/lng continue updating. Preserve existing `parseLocation` behavior for lat/lng consumers.
- `src/services/ChargeControl.ts`: solar-aware charging logic with Fleet API throttling.
- `src/services/TeslaFleetApi.ts`: OAuth/token lifecycle + vehicle commands.
- `src/services/EmailService.ts`: standalone Nodemailer helper, currently unused by the entrypoint; see credential limitation above.
- `src/util/*.ts`: cross-cutting helpers (timezones, notifications, filesystem).
- `src/types/*.ts`: domain types for Tesla data structures.
- `Dockerfile`, `Dockerfile_ARM`, `docker-compose.yml`: packaging/deployment scaffolding.

## DEV WORKFLOW EXPECTATIONS
- Favor TypeScript-first workflows; avoid plain JS additions unless unavoidable.
- Run `npm run build` before shipping to ensure strict-mode compilation passes.
- Container builds should follow the provided Dockerfiles; keep ARM + x86 parity when editing dependencies.
- If you add scripts or tooling, update this file so subsequent agents share the same playbook.

## CODING STYLE: GENERAL
- Follow existing file headers (author attribution) if editing legacy modules; skip for new ones unless relevant.
- Use TypeScript `strict`-mode friendly code: no implicit `any`, avoid `as any` unless justified with a comment.
- Prefer pure functions and small modules; keep side effects near entrypoints (`src/index.ts`).
- Stick to single quotes, trailing commas where TypeScript allows, and 2-space indentation (matches current code).
- Avoid non-ASCII characters unless user-facing strings require them.
- Keep functions under ~50 lines when possible; break out helpers in `src/util` or per-service folders.
- Align console/log prefixes with emoji convention already used (⚠️/✅/ℹ️) when meaningful.

## IMPORTS & MODULE STRUCTURE
- Group imports: Node built-ins first, third-party packages next, project-relative modules last.
- Use default vs named imports consistently with package style (e.g., `import io from 'socket.io-client';`).
- Avoid deep relative traversals; prefer `../` steps but do not introduce path aliases unless you update `tsconfig.json`.
- Remove unused imports immediately—`tsc --noUnusedLocals` is not enabled but keep hygiene manually.

## TYPES & INTERFACES
- Define reusable interfaces/types in `src/types/` to keep services lean.
- Export factory helpers (e.g., `createEmptyTeslaMate`) for initialization defaults instead of duplicating objects.
- Use discriminated unions or literal types for stateful enums (`'UP' | 'DOWN'` etc.); add explicit enums when values are shared.
- Prefer `const` objects for config and re-export named properties, mirroring `AppConfig`.
- When dealing with third-party responses, type as `AxiosResponse<Foo>` only when necessary—otherwise return domain types.

## NAMING CONVENTIONS
- Files: PascalCase for types, camelCase for utilities, Capitalized Service names inside `src/services`.
- Variables: `camelCase`; constants/immutable module-level values: `UPPER_SNAKE` or `const camelCase` depending on scope.
- Promises returning booleans should be prefixed with verbs (`setChargeCurrent`, `wakeUp`).
- Event handlers should describe source + action (`socket.on('connect_error', handler)`).

## ERROR HANDLING & LOGGING
- Always catch `axios` errors; log `error.response?.data || error.message` to keep outputs useful.
- When retries/backoffs exist, guard with flags similar to `refreshTokenProcessRunning` to prevent stampedes.
- For user-facing alerts (Telegram/LINE), degrade gracefully: log locally even if API call fails.
- Never swallow errors silently; return `null`/`false` and log context if a service layer fails so upstream callers can branch.
- Use `console.error` for unexpected failures, `console.warn` for transient config issues, `console.log` for normal flow.

## ASYNC, TIMERS, AND STATE
- Keep configurable timing/sample defaults in `AppConfig` (`src/constants/Constants.ts`); charging logic consumes `ADJUST_DELAY` and `GRID_AVG_SAMPLES` there.
- Store mutable shared state at module scope only when absolutely needed (e.g., `lastPublishTime`); otherwise pass explicitly.
- Always clear intervals/timeouts on shutdown hooks if you add new ones; `process.on('SIGINT')` already tears down MQTT/Socket trains.

## MQTT & SOCKET.IO NOTES
- Use `AppConfig.SOCKET_IO_EVENT` for the subscription; the hardcoded sanitized Huawei device key decides which payloads receive Tesla enrichment.
- Debounce publishes per-device; if you adjust logic, leave comments describing edge cases (rapid-fire inverter telemetry, etc.).
- Preserve QoS 1 / retain true unless the requested behavior requires changing them.
- Avoid blocking operations inside Socket.IO handlers—offload heavy work to helper functions or background loops.

## TESLA FLEET API SAFETY
- Never log raw tokens; redact to last 4 chars if debugging.
- Preserve duplicate-refresh prevention in `getValidToken`; account for the current lack of waiting by concurrent callers when adding token consumers.
- Respect `MAX_DAILY_COMMANDS`; update both constant + README comments if economic limits change.
- Persist every counter mutation through `updateCommandCounter` to keep the on-disk state canonical.

## TELEGRAM / LINE NOTIFY
- Telegram bot credentials live in env vars; do not hardcode.
- `sendTelegramNotify` currently logs every outgoing message—keep that behavior for auditing.
- If you expand notifications, reuse these helpers; don't duplicate request code.

## TIME / LOCALE UTILS
- Always display timestamps via `toLocalDateTimeTH` or `dateToLocalDateTimeTH` for Bangkok accuracy.
- Use `isInTimeWindow` for charge windows; do not reinvent timezone math.

## DOCKER & DEPLOYMENT
- OSRM Compose caps preparation memory at `1g` (`OSRM_PREPARE_MEMORY_LIMIT`) and serving at `512m` (`OSRM_MEMORY_LIMIT`), with no additional swap allowance. These caps may cause OOM on Thailand data; prepare on a larger host if needed and measure runtime needs. See README.
- Base images: Node 20 Alpine for x86/ARM; keep dependency parity when adding OS packages.
- Production containers should run `node dist/src/index.js`; never rely on `ts-node` in final images.
- Compose binds `./data/token.json`; if you restructure secrets, update `docker-compose.yml` and this file.
- Both Dockerfiles are multi-stage but currently copy all builder `node_modules`, including dev dependencies; production pruning is not implemented.
- x86 uses `/usr/src/app`, ARM uses `/app`; match token mounts to the selected image working directory. Compose currently builds `Dockerfile` and mounts the token under `/usr/src/app/data/token.json`.
- x86 installs openssl, busybox-extras, and curl in the builder only; ARM does not. Neither final stage receives those builder OS packages.
- Do not run `npm start`, the compiled app, or Compose as a routine documentation/build check: they connect to configured services and may publish telemetry, send notifications, refresh tokens, or change charging current.

## TESTING STRATEGY (FUTURE-PROOFING)
- No automated tests exist yet; introduce a runner (Jest or Vitest) under `npm test` before expecting CI reliability.
- For single test debugging once Jest is configured, use `npm test -- path/to/file.spec.ts --testNamePattern="name"`.
- Favor integration tests that simulate Socket.IO payloads and assert MQTT publishes.
- Mock Tesla APIs with adapters so tokens are never touched during unit tests.

## DOCUMENTATION & COMMENTS
- Only add comments when intent is non-obvious (e.g., throttle math, Fleet quotas).
- Update this AGENTS guide whenever tooling, scripts, or workflows change.
- Keep README/AGENTS consistent; if you diverge update both.

## GIT & CHANGE MANAGEMENT
- Never revert user changes; operate incrementally.
- Only commit on request; otherwise leave workspace dirty for the user to inspect.
- Reference files using inline code (e.g., `src/index.ts`) when writing PR/commit summaries.
- If you add new secrets/configs, extend `.gitignore` accordingly.

## WHEN ADDING NEW FILES
- Place services in `src/services`, utilities in `src/util`, and types in `src/types`.
- Export everything from its file (named exports preferred) to keep tree-shaking friendly.
- Keep filenames descriptive; avoid generic names like `utils2.ts`.

## REVIEW CHECKLIST BEFORE HANDOFF
- `npm run build` succeeds with no TypeScript errors.
- Secrets are not logged or committed; `.env*` untouched.
- Docker context builds successfully when relevant files changed.
- Telemetry/notification side effects are mocked or gated in unit tests.
- Documentation updated (README/AGENTS/inline comments) when behavior changes.

## LAST NOTES FOR AGENTS
- Prefer platform read/search tools when available; otherwise use `rg --files` / `rg` for repository inspection. Exclude env files, token data, dependencies, and generated output from broad searches.
- Prefer `apply_patch` for focused edits; avoid overwriting entire files unless intentional.
- Be explicit about command outputs when summarizing for the user; they do not see raw terminal logs.
- Treat embedded credential-like values as sensitive; use env vars for deployments and never reproduce credentials in handoffs.
- When uncertain, choose sensible defaults and explain them rather than blocking on questions.
