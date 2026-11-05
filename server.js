// FreshStart server (Node.js, no external dependencies).
// Serves the front end and a small JSON API. Calls the C pathfinder and
// the Python mentor matcher as child processes.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const GRAPH = path.join(DATA, "campus_graph.txt");
const MATCHER = path.join(ROOT, "python", "matcher.py");
const REQUESTS_FILE = path.join(DATA, "requests.json");
const PYTHON = process.env.PYTHON || "python3";
const WALK_METRES_PER_MIN = 80;

const campus = JSON.parse(fs.readFileSync(path.join(DATA, "campus.json"), "utf8"));
const faculty = JSON.parse(fs.readFileSync(path.join(DATA, "faculty.json"), "utf8"));

// ---- GHOST AI assistant (ported from the Nickuu voice assistant) ----
// Loads .env from the project directory and the user home directory so the
// same keys used by the Nickuu voice assistant work here too.
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const eq = t.indexOf("=");
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k) process.env[k] = v;
    }
  } catch (e) {
    console.log(`[warn] Could not read env file ${file}: ${e.message}`);
  }
}
loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(os.homedir(), ".env"));

// ---- Login (demo) ----
// Single fixed credential: change the DOB here to the student's real date of
// birth (YYYY-MM-DD). Everyone else is rejected.
const STUDENT_ID = "A2026IT12680";
const STUDENT_DOB = "2008-01-01";
const SESSION_COOKIE = "fs_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.FS_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

function makeSessionToken() {
  const payload = Buffer.from(JSON.stringify({ sub: STUDENT_ID, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  const mac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

function hasSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)fs_session=([^;]+)/);
  if (!match) return false;
  try {
    return verifySessionToken(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}

const ASSISTANT_SYSTEM = `You are GHOST, the friendly AI assistant built into FreshStart — a platform that helps first-year students settle in at IMS Engineering College (IMSEC), Ghaziabad.
Answer using the CAMPUS REFERENCE DATA below. If something is not covered there, say you are not sure and point the student to the right office, portal or tab on this site (Campus Info, Find My Way, Mentors, Events, Faculty, Campus Tour).
Keep replies short and practical (2-4 sentences). Reply in the language the student uses — English, Hindi or Hinglish.
Never invent dates, phone numbers, fees or policies that are not in the data. If asked who you are, say you are GHOST, the FreshStart AI assistant.

CAMPUS REFERENCE DATA

Locations:
${campus.locations.map((l) => `- ${l.name}: ${l.desc}`).join("\n")}

FAQs:
${campus.info.map((i) => `- [${i.category}] ${i.title} ${i.answer}`).join("\n")}

Upcoming events:
${campus.events.map((e) => `- ${e.date} ${e.title} (${e.category}) at ${e.venue}: ${e.desc}`).join("\n")}

Verified mentors:
${campus.mentors.filter((m) => m.verified).map((m) => `- ${m.name}, ${m.branch}, year ${m.year}: ${m.bio}`).join("\n")}`;

async function askGemini(key, contents) {
  for (const model of ["gemini-2.5-flash", "gemini-2.0-flash"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM }] },
            contents,
            generationConfig: { maxOutputTokens: 400, temperature: 0.6 },
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const parts = (data.candidates?.[0]?.content?.parts) || [];
      const text = parts.map((p) => p.text).filter(Boolean).join(" ").trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}

async function askOpenAI(key, messages) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 400,
        temperature: 0.6,
        messages: [{ role: "system", content: ASSISTANT_SYSTEM }, ...messages],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function publicMentor(m) {
  // Only expose verified mentors, and nothing beyond what the UI needs.
  return { id: m.id, name: m.name, branch: m.branch, year: m.year, interests: m.interests, bio: m.bio };
}

// Campus graph parsed once at startup (inlined in Node.js so no C
// compiler is needed; mirrors the algorithm in c/pathfinder.c).
// Format: "nodes edges", then N "<id> <name>" lines, then M "<a> <b> <weight>"
// undirected edges (weights are walking distances in metres).
const graph = (() => {
  const lines = fs.readFileSync(GRAPH, "utf8").split(/\r?\n/);
  const header = lines[0].trim().split(/\s+/);
  const n = Number(header[0]);
  const m = Number(header[1]);
  const adj = Array.from({ length: n }, () => ({}));
  for (let i = 0; i < m; i++) {
    const parts = lines[1 + n + i].trim().split(/\s+/);
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const w = Number(parts[2]);
    adj[a][b] = w;
    adj[b][a] = w;
  }
  return { n, adj };
})();

function runRoute(from, to) {
  const { n, adj } = graph;
  if (from < 0 || from >= n || to < 0 || to >= n) {
    return Promise.reject(new Error("invalid location"));
  }
  // Dijkstra's shortest path.
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] !== Infinity && (u === -1 || dist[i] < dist[u])) u = i;
    }
    if (u === -1) break;
    done[u] = true;
    for (const vStr in adj[u]) {
      const v = Number(vStr);
      const w = adj[u][v];
      if (!done[v] && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  if (dist[to] === Infinity) return Promise.reject(new Error("no route found"));
  const path = [];
  for (let at = to; at !== -1; at = prev[at]) path.push(at);
  path.reverse();
  return Promise.resolve({ distance: dist[to], path });
}

function runMatcher(student) {
  return new Promise((resolve, reject) => {
    const child = execFile(PYTHON, ["-I", MATCHER], { timeout: 5000 }, (err, stdout) => {
      let out;
      try {
        out = JSON.parse(stdout);
      } catch {
        return reject(new Error("Matcher failed"));
      }
      if (out.error) return reject(new Error(out.error));
      resolve(out);
    });
    child.stdin.end(JSON.stringify({ student, mentors: campus.mentors }));
  });
}

function loadRequests() {
  try {
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route !== "POST /api/login" && !hasSession(req)) {
    return sendJson(res, 401, { error: "Login required" });
  }

  if (route === "POST /api/login") {
    try {
      const body = await readBody(req);
      const id = clean(body.studentId, 20).toUpperCase();
      const dob = clean(body.dob, 10);
      if (id !== STUDENT_ID || dob !== STUDENT_DOB) {
        return sendJson(res, 401, { error: "Galat College ID ya date of birth. Dobara try karein." });
      }
      res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(makeSessionToken())}; Path=/; HttpOnly; SameSite=Lax`);
      return sendJson(res, 200, { ok: true, studentId: id });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (route === "GET /api/me") {
    return sendJson(res, 200, { ok: true, studentId: STUDENT_ID });
  }

  if (route === "GET /api/info") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const items = q
      ? campus.info.filter((i) => (i.title + " " + i.answer + " " + i.category).toLowerCase().includes(q))
      : campus.info;
    return sendJson(res, 200, items);
  }

  if (route === "GET /api/locations") return sendJson(res, 200, campus.locations);

  if (route === "GET /api/events") {
    const cat = url.searchParams.get("category");
    const items = cat ? campus.events.filter((e) => e.category === cat) : campus.events;
    return sendJson(res, 200, [...items].sort((a, b) => a.date.localeCompare(b.date)));
  }

  if (route === "GET /api/faculty") return sendJson(res, 200, faculty);

  if (route === "GET /api/mentors") {
    return sendJson(res, 200, campus.mentors.filter((m) => m.verified).map(publicMentor));
  }

  if (route === "GET /api/route") {
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const ids = campus.locations.map((l) => l.id);
    if (!ids.includes(from) || !ids.includes(to)) return sendJson(res, 400, { error: "Choose valid locations" });
    try {
      const r = await runRoute(from, to);
      const steps = r.path.map((id) => campus.locations.find((l) => l.id === id));
      return sendJson(res, 200, {
        distance: r.distance,
        minutes: Math.max(1, Math.round(r.distance / WALK_METRES_PER_MIN)),
        steps,
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (route === "POST /api/match") {
    try {
      const body = await readBody(req);
      const interests = Array.isArray(body.interests)
        ? body.interests.slice(0, 10).map((i) => clean(i, 40)).filter(Boolean)
        : [];
      const student = { branch: clean(body.branch, 20), interests };
      const ranked = await runMatcher(student);
      return sendJson(res, 200, ranked.map((m) => ({ ...publicMentor(m), score: m.score, reasons: m.reasons })));
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (route === "POST /api/requests") {
    try {
      const body = await readBody(req);
      const name = clean(body.name, 60);
      const message = clean(body.message, 500);
      const mentor = campus.mentors.find((m) => m.id === Number(body.mentorId) && m.verified);
      if (!name || !mentor) return sendJson(res, 400, { error: "Name and a valid mentor are required" });
      const all = loadRequests();
      all.push({ studentName: name, mentorId: mentor.id, message, createdAt: new Date().toISOString() });
      fs.writeFileSync(REQUESTS_FILE, JSON.stringify(all, null, 2));
      return sendJson(res, 201, { ok: true, message: `Request sent to ${mentor.name}` });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (route === "POST /api/assistant") {
    try {
      const body = await readBody(req, 20_000);
      const message = clean(body.message, 1000);
      if (!message) return sendJson(res, 400, { error: "Message is required" });
      const history = (Array.isArray(body.history) ? body.history : [])
        .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant") && m.content.trim())
        .slice(-8)
        .map((m) => ({ role: m.role, content: clean(m.content, 1000) }));

      const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      let reply = null;
      if (geminiKey) {
        reply = await askGemini(geminiKey, [
          ...history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
          { role: "user", parts: [{ text: message }] },
        ]);
      }
      if (!reply && openaiKey) {
        reply = await askOpenAI(openaiKey, [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: message },
        ]);
      }
      if (!reply) {
        return sendJson(res, 503, { error: "AI assistant is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to freshstart/.env" });
      }
      return sendJson(res, 200, { reply });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, url) {
  let rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (rel === "login" || rel === "login.html") {
    if (hasSession(req)) {
      res.writeHead(302, { Location: "/" });
      return res.end();
    }
    rel = "login.html";
  } else if (rel === "index.html" && !hasSession(req)) {
    res.writeHead(302, { Location: "/login" });
    return res.end();
  }
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    // The hosted build routes the API through /functions/v1/app — accept that
    // prefix locally too so the same front end works in both places.
    if (url.pathname.startsWith("/functions/v1/app/")) {
      url.pathname = url.pathname.slice("/functions/v1/app".length);
    }
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    serveStatic(req, res, url);
  })
  .listen(PORT, () => console.log(`FreshStart running at http://localhost:${PORT}`));
