const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "submissions.json");
const ADMIN_PASS = "1121";

let votes = [];
try {
  votes = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (_) {
  votes = [];
}
if (!Array.isArray(votes)) votes = [];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function saveVotes() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(votes, null, 2), "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getLocalAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

function getResults() {
  const counts = { A: 0, B: 0 };
  votes.forEach((vote) => {
    if (vote.choice === "A" || vote.choice === "B") counts[vote.choice] += 1;
  });
  const total = counts.A + counts.B;
  return {
    counts,
    total,
    percentages: {
      A: total ? Math.round((counts.A / total) * 100) : 0,
      B: total ? Math.round((counts.B / total) * 100) : 0,
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/votes" && req.method === "GET") {
    sendJson(res, 200, { votes, results: getResults() });
    return;
  }

  if (url.pathname === "/api/votes" && req.method === "POST") {
    try {
      const data = JSON.parse((await readBody(req)) || "{}");
      const choice = sanitizeText(data.choice, 1).toUpperCase();
      const deviceId = sanitizeText(data.deviceId, 80);
      const note = sanitizeText(data.note, 220);

      if (!["A", "B"].includes(choice) || !deviceId) {
        sendJson(res, 400, { error: "missing_required_field" });
        return;
      }

      const existing = votes.find((vote) => vote.deviceId === deviceId);
      const now = new Date().toISOString();
      if (existing) {
        existing.choice = choice;
        existing.note = note;
        existing.updatedAt = now;
      } else {
        votes.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          deviceId,
          choice,
          note,
          createdAt: now,
          updatedAt: now,
        });
      }

      votes = votes.slice(-240);
      saveVotes();
      sendJson(res, 201, { results: getResults() });
    } catch (_) {
      sendJson(res, 400, { error: "invalid_request" });
    }
    return;
  }

  if (url.pathname === "/api/admin" && req.method === "POST") {
    try {
      const data = JSON.parse((await readBody(req)) || "{}");
      if (data.pass !== ADMIN_PASS) {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      if (data.action !== "clear") {
        sendJson(res, 400, { error: "unknown_action" });
        return;
      }
      votes = [];
      saveVotes();
      sendJson(res, 200, { votes, results: getResults() });
    } catch (_) {
      sendJson(res, 400, { error: "invalid_request" });
    }
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const localAddress = getLocalAddress();
  console.log("Brain energy experiment app is running.");
  console.log(`Teacher/local: http://localhost:${PORT}`);
  console.log(`Students/LAN:  http://${localAddress}:${PORT}`);
});
