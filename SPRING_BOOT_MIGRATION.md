# Moving the API from Flask to Spring Boot

Status on 2026-10-10: the Flask API has been rewritten as a Spring Boot REST API. The Java code lives in its own git repository, `java-cricket-backend`, in the folder beside this one. This repository still holds the Python API, which is what is deployed. Nothing has been switched over.

## Where things are

| What | Where |
|---|---|
| Java API source, its tests, and the recording of the Flask backend's answers | `../java-cricket-backend/` |
| How to run, configure and test the Java API, its endpoint list, and how it differs from `backend/app.py` | `README.md` in that repository |
| The Python API that is deployed today | `backend/app.py` for local and Render, `api/index.py` for Vercel |
| What switching over involves | This document |

## Run the Java API with this frontend

```bash
cd ../java-cricket-backend
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
./mvnw spring-boot:run
```

Then open `http://localhost:5050` for the app, or `http://localhost:5050/docs` for a page that lists every endpoint and every response, with buttons that call the live API. The Java API serves this repository's `frontend/` folder by itself, because it looks for `../Cricket/frontend`. That works only while this folder is named `Cricket` and sits beside the Java repository. With no Firebase key it runs in demo mode, like the Flask app.

The `JAVA_HOME` line is needed on the owner's Mac, where the default Java is version 11.

## What is different from the Vercel API

The Java API follows `backend/app.py`. The Vercel function `api/index.py` had already drifted from it. If Java replaces the Vercel function, these change for users of the deployed site:

| Area | Vercel `api/index.py` today | Spring Boot |
|---|---|---|
| Session owner field in Firestore | Queries `user_id` | Reads and writes `uid` |
| Session list size | 10 | 50 |
| Profile stats | Read from `users/{uid}.stats` | Added up from the user's stored sessions |
| Stats fields | Includes `off_side_shots`, `leg_side_shots` | `total_sessions`, `total_swings`, `best_score`, `avg_speed` only. The dashboard then shows off-side and leg-side counts from shots saved in the browser. |
| Demo mode answers | Sample profile and two sample sessions | Zero stats and an empty session list |
| Bearer token `demo-token` | Always accepted as the demo user | Rejected once a key is configured |
| Endpoints | Three | All eleven of `backend/app.py` |

How the Java API differs from `backend/app.py` itself is listed in the Java repository's README. The main point is that the Socket.IO live push was not ported, because the Java API is REST only. The current dashboard does not use it.

## Not checked

- **A real Firebase project.** No real service account key was available, and the live project was deliberately not touched. Accepting a genuine ID token, and every Firestore read and write, are untested against the real service.
- **The Firestore index.** `GET /api/sessions` filters on `uid` and sorts on `started_at`, which needs a composite index in Firestore. Whether that index exists in the `cricpro-app` project is unknown. Without it the call returns an empty list with an `error` field. The Flask backend has the same requirement.
- **The dashboard in a browser against the Java API.** The frontend files are served unchanged, and the three calls the live frontend makes are covered by the Java tests. A signed-in browser session was not run, because signing up creates a real account.
- **The bat hardware.** Readings were sent with `curl` and by the tests, not by an ESP32.
- **A Docker build.** No Dockerfile exists yet.

## Steps left before Java can replace Python

1. **Choose where the Java API runs.** Vercel has no Java runtime, so it cannot host it. Render has no native Java runtime either and needs a Docker image.
2. **Connect the frontend to it.** With the code in two repositories, the natural layout is that Vercel keeps serving `frontend/` from this repository and `vercel.json` forwards `/api/*` to the Java host. The frontend needs no change, because it calls `/api/...` on its own origin. This forwarding has not been tested.
3. **Write and test a Dockerfile** in the Java repository.
4. **Size the host.** In demo mode on the owner's Mac the process used about 300 MB of memory, or 230 MB with `-Xmx256m`. With Firebase connected it will use more. Run one instance only, because sessions in progress are kept in memory.
5. **Provide the key** to the Java host as the secret `FIREBASE_SERVICE_ACCOUNT_JSON`.
6. **Test against the real project:** sign in, load the profile and session list, record and stop a session, and confirm the Firestore index.
7. **Decide the points in the Vercel table above**, the `uid` field first, because it decides which stored sessions users can see.
8. **Switch over, then remove** `backend/`, `api/`, `Procfile` and the Python parts of `render.yaml` and `vercel.json` from this repository, and update `README.md` and `AGENTS.md`.

If live push to the dashboard is wanted again, it needs a decision of its own, because Socket.IO is not REST. The smallest REST replacement is one endpoint that returns a device's latest reading, polled by the page.

## Until the switch

Three copies of the API exist: `backend/app.py`, `api/index.py` and the Java repository. The Java tests compare against a recording of `backend/app.py`. After changing an endpoint there, record again and run the Java tests, which then show exactly what the Java side has to match:

```bash
cd ../java-cricket-backend
PYTHONDONTWRITEBYTECODE=1 python src/test/resources/parity/generate_golden.py
./mvnw test
```

The recording script imports `backend/app.py` from this repository, so this repository's Python dependencies must be installed in the Python you run it with.
