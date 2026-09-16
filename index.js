"use strict";

const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode"); // Backend QR generator added
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BODY_LIMIT = process.env.BODY_LIMIT || "2mb";
const AUTH_DIR = process.env.AUTH_DIR || "auth_info";
const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || "91";
const STARTUP_VERSION = [2, 3000, 1015901307];

let sock = null;
let currentQR = "";
let isStarting = false;

app.disable("x-powered-by");
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

async function startSock() {
  if (isStarting) return;
  isStarting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version = STARTUP_VERSION;
    try {
      const fetched = await fetchLatestBaileysVersion();
      if (Array.isArray(fetched.version)) version = fetched.version;
      console.log("WhatsApp version:", version.join("."));
    } catch (err) {
      console.log("Version fetch failed, using backup version.");
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ["Bulk WhatsApp API", "Chrome", "1.0.0"],
      logger: pino({ level: process.env.LOG_LEVEL || "silent" }),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        // Generate base64 image directly on the backend to prevent frontend crashes
        currentQR = await qrcode.toDataURL(qr);
        console.log("QR ready. Open /qr to scan.");
      }
      if (connection === "open") {
        currentQR = "";
        console.log("WhatsApp engine ready.");
      }
      if (connection === "close") {
        currentQR = "";
        const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log("Connection closed. Code:", statusCode, "Reconnect:", shouldReconnect);
        sock = null;
        if (shouldReconnect) setTimeout(startSock, 2000);
      }
    });
  } catch (err) {
    console.error("Startup error:", err && err.stack ? err.stack : err);
    sock = null;
    setTimeout(startSock, 5000);
  } finally {
    isStarting = false;
  }
}

function assertReady() {
  if (!sock) throw httpError(503, "WhatsApp engine is not ready.");
  if (!sock.user || !sock.user.id) throw httpError(503, "WhatsApp is still syncing. Try again shortly.");
}

function cleanNumber(number) {
  let cleaned = String(number || "").replace(/\D/g, "");
  if (!cleaned) return "";
  if (cleaned.length === 10) cleaned = DEFAULT_COUNTRY_CODE + cleaned;
  return cleaned;
}

function jidFor(number) {
  const cleaned = cleanNumber(number);
  if (!cleaned) throw httpError(400, "Valid phone number is required.");
  return `${cleaned}@s.whatsapp.net`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sendError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ ok: false, message: err.message || "Internal error" });
}

// ---------------------------------------------------------
// Endpoints (Routes)
// ---------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Bulk WhatsApp API",
    ready: Boolean(sock && sock.user && sock.user.id),
    qrAvailable: Boolean(currentQR)
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    ready: Boolean(sock && sock.user && sock.user.id),
    uptime: process.uptime(),
    heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  });
});

// The updated QR route with foolproof rendering
app.get("/qr", (req, res) => {
  if (!currentQR) {
    return res.send("<!doctype html><html><body style='font-family:Arial,sans-serif;text-align:center;margin-top:15vh'><h2>QR is not ready or already scanned.</h2><p>Refresh after a few seconds if the session is still connecting.</p></body></html>");
  }
  res.send(`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scan WhatsApp QR</title></head>
<body style="display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;background:#f0f2f5;font-family:Arial,sans-serif">
  <h2>Scan to Link WhatsApp</h2>
  <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 10px 25px rgba(15,23,42,.18)">
    <img src="${currentQR}" alt="WhatsApp QR Code" style="width:256px; height:256px; border: 2px solid #ccc; padding: 10px; border-radius: 8px;" />
  </div>
  <p style="color:gray; font-size:14px; margin-top:20px;">Page refreshes automatically every 5 seconds.</p>
  <script>setTimeout(() => location.reload(), 5000);</script>
</body>
</html>`);
});

// Bulk Messaging Endpoint (Called by Apps Script)
app.post("/send", async (req, res) => {
  try {
    assertReady();
    const { numbers, message } = req.body || {};
    
    if (!message) throw httpError(400, "Message is required.");
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      throw httpError(400, "Valid array of phone numbers is required.");
    }

    res.json({ ok: true, type: "bulk-message", queuedCount: numbers.length });

    (async () => {
      for (let i = 0; i < numbers.length; i++) {
        const number = numbers[i];
        try {
          const jid = jidFor(number);
          await sock.sendMessage(jid, { text: String(message) });
          console.log(`Message sent to ${number}`);
        } catch (err) {
          console.error(`Failed to send to ${number}:`, err.message);
        }

        if (i < numbers.length - 1) {
          const delayMs = Math.floor(Math.random() * (30000 - 5000 + 1)) + 5000;
          console.log(`Waiting ${delayMs}ms before next message...`);
          await sleep(delayMs);
        }
      }
      console.log("Bulk message batch completed.");
    })();

  } catch (err) {
    sendError(res, err);
  }
});

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") return res.status(413).json({ ok: false, message: "Payload too large. Reduce HTML size or BODY_LIMIT." });
  sendError(res, err);
});

app.listen(PORT, () => {
  console.log(`Bulk WhatsApp API listening on ${PORT}`);
  startSock();
});
