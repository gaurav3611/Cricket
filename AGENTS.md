# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should start with [README.md](README.md).

## What this project is

SSwinGG is a cricket bat swing analytics web app. A sensor on the bat (an ESP32 board with an MPU6050 motion sensor) streams accelerometer and gyroscope readings to the browser over Bluetooth Low Energy (BLE). The browser computes bat speed, impact, control and shot direction, draws live charts and a 3D bat, and saves each shot.

- **Frontend**: static HTML, CSS and plain JavaScript in `frontend/`. Chart.js, Three.js and the Firebase compat SDK load from CDNs. There is no build step and no `package.json`.
- **Backend**: Python Flask, in two separate implementations (see [Two backends](#two-backends)). A Spring Boot rewrite lives in its own repository, `java-cricket-backend`, and is not deployed (see [Spring Boot port](#spring-boot-port)).
- **Auth and data**: Firebase Authentication (email and Google) and Firestore, project id `cricpro-app`.
- **Hosting**: Vercel (`vercel.json`). Render (`render.yaml`) and a `Procfile` exist as an alternative.

The product used to be called CricPro. That name survives in code comments, the server banner, one storage key and the Firebase project id.

## Read this first

Three facts are not obvious from the file names. Each one causes wasted work if missed.

1. **The live dashboard code is inline in `frontend/dashboard.html`.** That file holds the markup, one `<style>` block and one `<script>` block of about 1,200 lines. `frontend/js/dashboard.js`, `frontend/js/bluetooth.js` and `frontend/css/dashboard.css` are not loaded by any page. Editing them changes nothing the user sees.
2. **There are two Python backends and they have drifted apart.** `backend/app.py` runs locally and on Render. `api/index.py` runs on Vercel and implements only three endpoints. A Spring Boot rewrite of `backend/app.py` lives in the separate `java-cricket-backend` repository, and nothing deploys it yet.
3. **`python app.py` fails in a non-interactive shell.** Use `flask --app app run --port 5050` when you start the server from a tool call or a background job.

## Repository map

| Path | Status | Purpose |
|---|---|---|
| `frontend/index.html` | live | Login and registration page. Loads `css/main.css`, `css/auth.css`, `js/firebase-config.js`, `js/auth.js`. |
| `frontend/dashboard.html` | live | The whole dashboard, with inline CSS and inline JavaScript. Loads `js/firebase-config.js` and `js/three-bat.js`. |
| `frontend/js/firebase-config.js` | live | Firebase web config, `initializeFirebase()`, `getAuthToken()`, `apiCall()` and the `isDemoMode` flag. |
| `frontend/js/auth.js` | live | Login, registration and Google sign-in for `index.html`. |
| `frontend/js/three-bat.js` | live | 3D bat scene. Public functions: `init3DBat(containerId)`, `update3DBat(gy, gx, gz, impact)`, `resetBat3D()`. |
| `frontend/css/main.css`, `frontend/css/auth.css` | live | Styles for `index.html` only. |
| `frontend/js/dashboard.js`, `frontend/js/bluetooth.js`, `frontend/css/dashboard.css` | legacy, unreferenced | An earlier dashboard implementation. Do not edit expecting an effect. Do not delete without asking the owner. |
| `backend/app.py` | live, local and Render | Flask and Flask-SocketIO server. Also serves `frontend/` as static files. |
| `backend/firebase_config.py` | live | Firebase Admin helpers used by `backend/app.py`. |
| `api/index.py` | live, Vercel | Reduced serverless Flask API. |
| `backend/requirements.txt`, `api/requirements.txt` | live | Identical copies. Change both together. |
| `../java-cricket-backend/` | separate repository, not deployed | Spring Boot rewrite of `backend/app.py`, in the folder beside this one. See [Spring Boot port](#spring-boot-port). |
| `../angular-cricket-frontend/` | separate repository, not deployed | Angular rewrite of `frontend/`, in the folder beside this one, on GitHub as [Cric-Pro-FE](https://github.com/gaurav3611/Cric-Pro-FE). See [Angular port](#angular-port). |
| `../hardware/` | separate repository | Bat sensor circuit, firmware and guide, on GitHub as [Cric-Pro-Hardware](https://github.com/gaurav3611/Cric-Pro-Hardware). See [Sensor contract](#sensor-contract). |
| `../mobile_app_swing/` | separate repository, Android | Flutter app that records shots from the bat over Bluetooth to CSV files, on GitHub as [mobile_app_swing](https://github.com/gaurav3611/mobile_app_swing). Uses the same service, characteristic and packet as the dashboard. |
| `SPRING_BOOT_MIGRATION.md` | documentation | Status of the move to Spring Boot: where the Java code is, how it differs from what is deployed, what is left. |
| `vercel.json`, `render.yaml`, `Procfile` | deploy config | See [Deployment](#deployment). |
| `firmware/` | not in the repo | Ignored by git and kept on the owner's machine only. |

## Setup and run

```bash
cd backend
python3 -m venv venv              # backend/venv/ is gitignored
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # sets PORT=5050; backend/.env is gitignored
```

Start the server from `backend/`:

```bash
# From an interactive terminal
python app.py

# From a non-interactive shell: agent tool call, background job, CI
flask --app app run --port 5050
```

Then check it and open `http://localhost:5050`:

```bash
curl http://localhost:5050/api/health
```

Things that go wrong here, all reproduced on macOS on 2026-10-08:

- **No terminal attached.** `python app.py` raises `RuntimeError: The Werkzeug web server is not designed to run in production` when stdin is not a terminal. Flask-SocketIO enforces this. The `flask` command does not have the restriction.
- **Port 5000.** Without `backend/.env` the app defaults to port 5000, which macOS AirPlay Receiver already holds. Use 5050. The `flask` command ignores `PORT`, so always pass `--port`.
- **`python` not found.** Outside a virtual environment macOS has `python3` only.
- **Python version.** The repo does not pin one. The dependencies install and the app runs on Python 3.11 and 3.14. The deploy command in `Procfile` and `render.yaml` uses the gunicorn eventlet worker, which works on 3.11 and crashes at import on 3.14 with the pinned `eventlet==0.37.0`. Use a 3.11 environment to reproduce the deploy command. Other versions were not tested.
- **Demo mode banner.** With no `backend/serviceAccountKey.json` the server prints a warning and starts in demo mode. That is the normal local state, not an error.
- **`file://` does not work.** Pages reference assets by absolute path, for example `/js/three-bat.js`. Serve them through the backend.

## How the live app works

1. `index.html` signs the user in with Firebase and redirects to `/dashboard.html`. The dashboard redirects back to `/` when nobody is signed in.
2. The dashboard home view shows stats and shot history from `localStorage`, then calls `GET /api/profile` and `GET /api/sessions`.
3. The live view gets readings from one of two sources. **Connect** pairs with the bat through Web Bluetooth. **Start Demo** generates simulated readings in the browser with `startDemoData()` and involves no backend.
4. **START SHOT** begins recording. Every reading goes through `processData()`, which updates the charts, the 3D bat and the live numbers.
5. **STOP & SAVE SHOT** runs `analyzeSwingData()` and stores the result with `saveShotToHistory()` under the `localStorage` key `swinglab_shots`. The list is newest first and capped at 50.

The live frontend calls exactly three backend endpoints: `GET /api/profile`, `GET /api/sessions`, and `PUT /api/profile` once at registration. Shots are stored in the browser only. Nothing in the live frontend writes sessions to Firestore, opens a Socket.IO connection, or calls `/api/session/start`, `/api/session/stop`, `/api/sensor-data` or `/api/demo/start`. Those exist in `backend/app.py` and were used by the legacy `dashboard.js`.

### Sensor contract

The browser and the bat firmware must agree on these values. The firmware is not in this repo, so do not change them unless the owner confirms a matching firmware change.

- Device name prefix: `SwingLab`.
- BLE service UUID: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`.
- Sensor characteristic UUID, notify: `beb5483e-36e1-4688-b7f5-ea07361b26a8`.
- Packet: at least 14 bytes, seven little-endian `int16` values in the order `ax, ay, az, gx, gy, gz, temperature`. The live code ignores temperature.
- Scaling: accelerometer raw / 4096 gives g (±8 g range). Gyroscope raw / 16.4 gives °/s (±2000 °/s range).

Speed is computed as:

```
speed_kmh = |angular velocity in °/s| × π/180 × 0.85 m × 3.6
```

Angular velocity below 5 °/s counts as zero, speed is capped at 180 km/h, and the displayed value is smoothed as 30% previous plus 70% current.

This formula appears twice in `dashboard.html`, in `processData()` and in `analyzeSwingData()`. Change both together.

A firmware for an ESP32-C3 Super Mini with a BMI160 sensor that follows this contract is in its own repository, [Cric-Pro-Hardware](https://github.com/gaurav3611/Cric-Pro-Hardware), kept in the folder `hardware` beside this one. It holds the circuit with battery and charger, nine staged sketches and the guide. `stages/08_sswingg_bat/swing_packet.h` builds the packet and `config.h` holds the ids. It has been compiled and run in a simulator, and its packets were read back with the Angular app's decoder, but it has not run on hardware. An earlier version is in `firmware/esp32c3-bmi160/` here, which git ignores.

The legacy files use different constants. `bluetooth.js` scales by 16384 and 131. `backend/app.py` uses a 0.55 m radius, a 10 °/s dead zone and a 160 km/h cap. Those are not reference values. Do not change the live code to match them.

## Two backends

| Endpoint | `backend/app.py` | `api/index.py` on Vercel |
|---|---|---|
| `GET /api/health` | yes | yes |
| `GET /api/profile` | yes, stats aggregated from `sessions` documents | yes, stats read from `users/{uid}.stats` |
| `PUT /api/profile` | yes | no |
| `GET /api/sessions` | yes, filters on field `uid`, limit 50 | yes, filters on field `user_id`, limit 10 |
| `GET` and `DELETE /api/session/<id>` | yes | no |
| `POST /api/session/start`, `POST /api/session/stop` | yes | no |
| `POST /api/sensor-data`, `GET /api/esp32/status`, `POST /api/demo/start` | yes | no |
| Socket.IO events | yes | no |
| Static frontend | Flask serves `frontend/` | Vercel routes `/(.*)` to `/frontend/$1` |

Other differences:

- **Credentials.** `backend/app.py` reads a key file at `FIREBASE_SERVICE_ACCOUNT_PATH`, default `serviceAccountKey.json` relative to `backend/`. `api/index.py` reads the whole key as a JSON string from `FIREBASE_SERVICE_ACCOUNT_JSON`. The README names the path variable for Vercel, but the Vercel code reads the JSON variable.
- **Session owner field.** `backend/app.py` writes and queries `uid`. `api/index.py` queries `user_id`. Sessions written by one are invisible to the other.
- **Demo responses.** `backend/app.py` returns zero stats and an empty session list. `api/index.py` returns hardcoded sample stats and two sample sessions.
- **Demo token.** `api/index.py` treats the literal bearer token `demo-token` as the demo user even when Firebase is configured.
- **Auth decorator.** `backend/app.py` sets `request.uid`. `api/index.py` passes `uid` as the first argument to the route function.
- **State.** `backend/app.py` keeps active sessions and device buffers in process memory. It must run as a single worker, and a restart loses that state.

Rule: when you change an endpoint the live frontend uses, change it in both files. Otherwise local and Vercel behave differently. Until the Python code is retired, the `java-cricket-backend` repository is a third copy to keep in step.

## Spring Boot port

A Spring Boot 4.1 REST API in Java 21 reimplements all eleven operations of `backend/app.py`. It lives in its own git repository, `java-cricket-backend`, kept in the folder beside this one. It is not deployed and the frontend in production does not use it. That repository's `README.md` covers running, configuration, endpoints and tests. [SPRING_BOOT_MIGRATION.md](SPRING_BOOT_MIGRATION.md) in this repository covers what switching over involves. The points that matter when working across the two:

```bash
cd ../java-cricket-backend
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
./mvnw test                # the whole test suite
./mvnw spring-boot:run     # serves the API and this repository's frontend on port 5050
```

- **Set `JAVA_HOME`.** The default `java` on the owner's Mac is 11. Without Java 21 the build fails with `release version 21 not supported`.
- **It finds this frontend by folder name.** It serves `../Cricket/frontend`, so this folder must stay named `Cricket` and sit beside it. Otherwise set `FRONTEND_DIR`.
- **The contract is a recording of this repository's Flask backend.** `src/test/resources/parity/golden.json` in the Java repository holds 454 requests and the answers `backend/app.py` gave. Its `ParityTest` replays them against the Java API.
- **A change to `backend/app.py` needs a new recording.** Run `generate_golden.py` from the Java repository, which imports `backend/app.py` from this one, then run `./mvnw test` there. Do not edit `golden.json` by hand.
- **Keep the formulas identical.** `SensorMath.java` and `SessionAnalytics.java` copy the Python arithmetic, including Python's tie-to-even rounding. Change both sides together.
- **It documents itself.** While it runs, `http://localhost:5050/docs` lists every endpoint and every response, with buttons that call the live API.
- **REST only.** The Socket.IO events of the Flask app were not ported.
- **Not verified against a real Firebase project.** Token acceptance and Firestore calls have only run against stand-ins and a generated key.

## Angular port

`frontend/` has been rewritten as an Angular 21 single-page app. It lives in its own project folder, `angular-cricket-frontend`, beside this one, and on GitHub as [Cric-Pro-FE](https://github.com/gaurav3611/Cric-Pro-FE). It is not deployed, and the site in production still serves `frontend/`. That project's `README.md` and `AGENTS.md` cover how to run and change it. The points that matter when working across the two:

- **It is checked against this repository's dashboard.** Its `tools/parity.mjs` opens `frontend/dashboard.html` from here in headless Chrome, records what it shows for fixed sensor input, and compares the Angular app with that recording.
- **A change to `frontend/dashboard.html` needs a new recording.** In the Angular project run `npm run parity:record` and then `npm run verify`. The second command then shows what the Angular side has to match.
- **The ids, class names and storage keys of `frontend/` are shared.** The Angular templates keep the same ids and nearly all classes, and it uses the same `localStorage` keys.
- **It no longer looks or reads like `frontend/`.** The Angular app was restyled on purpose: no purple, gradients, pill shapes, emoji or moving background, and plainer text. Its numbers and behaviour are still checked against this dashboard. Texts that differ are listed in its `tools/golden/copy-changes.json`. `frontend/` itself was not restyled.
- **It can be served by the Java API.** Point `FRONTEND_DIR` at its build folder.

## Demo mode

Three unrelated switches share the name.

| Switch | Location | On when | Effect |
|---|---|---|---|
| `isDemoMode` | `frontend/js/firebase-config.js` | The Firebase SDK failed to load, or `firebaseConfig.apiKey` equals `YOUR_API_KEY` | Login accepts any email, the user is stored in `localStorage` under `cricpro_demo_user`, and API calls send the token `demo-token` |
| `demo_mode` | `backend/app.py`, `api/index.py` | Service-account credentials are missing | Auth is skipped, every request is the demo user, nothing is persisted |
| Start Demo button | `frontend/dashboard.html` | The user clicks it | Simulated sensor readings in the browser |

A real Firebase web config is committed, so `isDemoMode` is normally false and the login page talks to the real `cricpro-app` project. Registering through the UI creates a real account there. Do not register or sign in during automated checks unless the user asks.

The README says to log in with any email. That works only when `isDemoMode` is true. To reach the dashboard without an account, temporarily set `apiKey` to `YOUR_API_KEY` in your working copy and revert it before committing.

## Frontend conventions

- **Global scripts, no modules.** Every script shares the global scope and load order matters: Firebase compat SDK, then `firebase-config.js`, then the page script. `dashboard.html` uses inline `onclick` attributes, so its handler functions must stay global.
- **Match the file you are in.** The inline dashboard script uses `var` and function declarations. The external files use `let` and `const`.
- **Library versions.** Three.js is r128, loaded as the global `THREE`. ES module imports and APIs added after r128 are unavailable. Firebase compat is 10.14.1. Chart.js is loaded unpinned from jsDelivr.
- **Two sets of CSS variables.** `dashboard.html` defines `--bg`, `--accent`, `--accent2`, `--green`, `--muted`. `main.css` defines `--bg-primary`, `--accent-cyan`, `--accent-orange`, `--text-muted`. They are not interchangeable.
- **Fonts.** Orbitron for headings and numbers, Inter for body text.
- **Storage keys.** `swinglab_shots` and `cricpro_demo_user`. Renaming either discards data saved in users' browsers.
- **Do not mass-rename CricPro to SSwinGG.** The storage key, the Firebase project id and the BLE name prefix are functional values.
- **HTML injection.** Much of the markup is built with string concatenation and `innerHTML`. Use `textContent` for anything a user typed, such as a display name.
- **Browser support.** Web Bluetooth works only in Chromium browsers such as Chrome and Edge, and only on `https` or `localhost`.

## Backend conventions

- JSON keys are `snake_case`. Errors return `{'error': message}` with an HTTP status code.
- Logging is `print` with a tag prefix: `[OK]`, `[ERR]`, `[WS]`, `[DB]`, `[AUTH]`.
- Protect every route that touches user data with `@require_auth`.
- Firestore collections: `sessions`, keyed by an 8-character session id, and `users`, keyed by Firebase uid.
- The dashboard reads these session fields: `session_id`, `started_at`, `duration_seconds`, `swing_count`, `peak_speed_kmh`, `overall_score`. It reads these stats fields: `total_sessions`, `avg_speed`, `off_side_shots`, `leg_side_shots`, `total_swings`.

## Verifying changes

The Python and frontend code have no tests, no linter, no formatter and no CI. Do not report that tests pass for them. The Spring Boot port has its own suite, run with `./mvnw test` in the `java-cricket-backend` repository. For the rest, these checks exist and all pass on the current code:

```bash
# Python syntax, run from the repo root
python3 -c "import ast,sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]; print('ok')" \
  backend/app.py backend/firebase_config.py api/index.py

# JavaScript syntax
node --check frontend/js/firebase-config.js
node --check frontend/js/auth.js
node --check frontend/js/three-bat.js

# The dashboard's inline script
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' frontend/dashboard.html > /tmp/dashboard-inline.js \
  && node --check /tmp/dashboard-inline.js

# Backend smoke test, with the server running
curl http://localhost:5050/api/health
```

Syntax checks do not exercise behavior. For a dashboard change, the real check is manual: open the dashboard in Chrome, click **Start Demo**, click **START SHOT**, wait a few seconds, click **STOP & SAVE SHOT**, and confirm a shot card appears and shows up on the home view. This needs a signed-in session, see [Demo mode](#demo-mode). Say plainly which of these you ran and which you did not.

## Deployment

- **Vercel.** `vercel.json` builds `api/index.py` as a Python function for `/api/*` and serves everything else from `frontend/`.
- **Render and Procfile.** Both run `cd backend && gunicorn --worker-class eventlet -w 1 app:app --bind 0.0.0.0:$PORT`. Keep the single worker.
- `render.yaml` points `FIREBASE_SERVICE_ACCOUNT_PATH` at `serviceAccountKey.json`, which git ignores. A deploy from git therefore runs in demo mode unless the key is supplied separately.
- Do not deploy, push, or change Firebase, Vercel or Render settings unless the user asks.

## Security and secrets

- Never commit `backend/.env` or `backend/serviceAccountKey.json`. Both are gitignored.
- The `firebaseConfig` object in `firebase-config.js` is the public web client config. Leave it in place. Replacing it with placeholders switches the whole site into demo mode.
- These routes have no authentication today: `POST /api/sensor-data`, `GET /api/esp32/status`, `POST /api/demo/start`, `GET /api/health`. Each call to `/api/demo/start` starts a simulation thread that never stops.
- CORS allows every origin, and backend demo mode skips auth on every route. Do not put real user data behind either pattern.

## Git

- The default branch is `main`.
- Commit subjects use a type prefix and a short summary, for example `fix: Smaller bat (0.45x), thinner trail, bright yellow glow`. Types in use: `feat`, `fix`, `docs`, `chore`.
- Commit or push only when the user asks.

## Keeping this file current

Update this file when any of these change: the dashboard script moves out of `dashboard.html`, the legacy files are removed, the two backends are unified, the Spring Boot port is deployed or the Python code is retired, the Angular port replaces `frontend/`, tests or a linter are added, a Python version is pinned, or the sensor packet format changes.
