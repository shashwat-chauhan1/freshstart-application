# FreshStart

A simple platform that helps first-year college students settle in: searchable campus info, a campus route finder, matching with verified senior mentors, and an events board.

## Tech used

| Part | Language | Role |
|------|----------|------|
| `public/` | HTML, CSS, JavaScript | Responsive single-page front end |
| `public/assistant.js` | JavaScript | GHOST AI chat widget (floating assistant) |
| `server.js` | Node.js (no dependencies) | Web server, JSON API and AI assistant endpoint |
| `python/matcher.py` | Python 3 | Ranks verified mentors for a student's branch and interests |
| `c/pathfinder.c` | C | Dijkstra shortest path between campus locations |
| `data/` | JSON / text | Campus info, mentors, events, campus graph |

## Run it

Requirements: Node.js 18+, Python 3, and a C compiler (gcc).

```bash
make            # compiles the C pathfinder
node server.js  # starts on http://localhost:3000
```

On Windows without `make`: `gcc c/pathfinder.c -o c/pathfinder.exe` (then edit the `PATHFINDER` path in `server.js` to add `.exe`) and use `set PYTHON=python` if `python3` is not available.

## API

- `GET /api/info?q=text` search campus FAQs
- `GET /api/locations` campus locations
- `GET /api/route?from=0&to=3` shortest walking route (calls C)
- `GET /api/mentors` verified mentors only
- `POST /api/match` `{branch, interests[]}` ranked mentors (calls Python)
- `POST /api/requests` `{name, mentorId, message}` saved to `data/requests.json`
- `GET /api/events?category=Sports` events board
- `POST /api/assistant` `{message, history[]}` GHOST AI reply, grounded in campus data

## Login

The app sits behind a login page (`/login`). Sign in with the college ID and
its date of birth. The accepted credential is set in `server.js`
(`STUDENT_ID`, `STUDENT_DOB`) and is intentionally not documented here.

Sessions use a signed HttpOnly cookie (12 h). All `/api/*` routes except
`POST /api/login` require a session; visiting `/` without one redirects to
the login page. Set `FS_SESSION_SECRET` in `.env` to keep sessions valid
across server restarts (otherwise a random secret is generated at startup).

## AI assistant (GHOST)

The floating 🤖 chat widget answers questions about campus using the data in
`data/campus.json` as context. It uses the Gemini API (or OpenAI as fallback).

Set a key in `freshstart/.env` (same format as the Nickuu voice assistant):

```
GEMINI_API_KEY=your-key-here     # or OPENAI_API_KEY
```

Restart `node server.js` after adding the key. Without a key the widget opens
fine but replies with a setup message.

## How it addresses the problem

- **Scattered information** becomes one searchable page.
- **Unfamiliar campus** is handled by the route finder.
- **Trusted guidance** comes from verified mentors only; unverified ones are never shown.
- **Engagement** is supported through the events board and the mentor request flow.

## Customising for your college

Edit `data/campus.json` (info, mentors, events) and `data/campus_graph.txt` (locations and walking distances in metres; the first line is `nodes edges`). Keep the node ids in the graph file in sync with `locations` in `campus.json`.
