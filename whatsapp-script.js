// Import core Baileys functions
import {
  makeWASocket,
  useMultiFileAuthState,
  downloadMediaMessage,
  DisconnectReason
} from "@whiskeysockets/baileys";

import Pino from "pino";
import fs from "fs";
import readline from "readline";
import process from "process";
import dns from "dns";
import chalk from "chalk";
import qrcode from "qrcode-terminal";
import ffmpeg from "fluent-ffmpeg";
import os from "os";
import path from "path";
import { exec } from "child_process";

// Use Termux’s ffmpeg binary
ffmpeg.setFfmpegPath("/data/data/com.termux/files/usr/bin/ffmpeg");

// Helper for delay
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Function to normalize JIDs
function normalizeJid(jid) {
  return jid ? jid.trim().toLowerCase() : "";
}

// Terminal input interface (în română)
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(chalk.red(query), (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Function to wait for an internet connection
async function waitForInternet() {
  console.log(chalk.red("⏳ Conexiunea a fost pierdută. Aștept conexiunea la internet..."));
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      dns.resolve("google.com", (err) => {
        if (!err) {
          console.log(chalk.red("✔ Conexiunea a revenit, reluăm trimiterea..."));
          clearInterval(interval);
          resolve(true);
        }
      });
    }, 5000);
  });
}

// Function to check DNS resolution for web.whatsapp.com
async function checkDNS() {
  return new Promise((resolve, reject) => {
    dns.lookup("web.whatsapp.com", (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// Banner afișat în terminal
console.log(chalk.red(`
===================================
        GYOVANNY WHATSAPP SCRIPT👑
===================================`));

// Global configuration and state
global.botConfig = {};
global.configReady = false;
global.connectionMethod = null;
global.owner = null;

let activeSessions = {};     // sesiuni de trimitere mesaje/poze
let activeNameLoops = {};    // sesiuni de looping nume de grup

/**
 * Loop infinit pentru schimbarea subiectului unui grup
 */
async function groupNameLoop(chatId, sock) {
  while (activeNameLoops[chatId]?.running) {
    const loopData = activeNameLoops[chatId];
    const currentName = loopData.groupNames[loopData.currentIndex];
    try {
      await sock.groupUpdateSubject(chatId, currentName);
      console.log(chalk.red(`[GroupNameLoop] Grupul ${chatId} actualizat la: ${currentName}`));
    } catch (error) {
      console.error(chalk.red(`[GroupNameLoop] Eroare schimbare nume ${chatId}:`), error);
    }
    loopData.currentIndex = (loopData.currentIndex + 1) % loopData.groupNames.length;
    await delay(loopData.delay);
  }
  console.log(chalk.red(`[GroupNameLoop] Loop nume grup pentru ${chatId} oprit.`));
}

/**
 * Pornește o sesiune de trimitere mesaje/poze
 */
async function handleStartCommand(chatId, delayValue, mentionJids, sock) {
  if (activeSessions[chatId]) {
    activeSessions[chatId].delay = delayValue;
    activeSessions[chatId].mentionJids = mentionJids;
    console.log(chalk.red(`Sesiunea ${chatId} actualizată.`));
    return;
  }

  activeSessions[chatId] = {
    running: true,
    delay: delayValue,
    mentionJids,
  };

  const config = global.botConfig;

  // Trimitem primul mesaj/poză instantaneu
  try {
    if (config.sendType === "mesaje") {
      let textToSend = config.fullMessage;
      if (mentionJids.length) {
        const mentionsText = mentionJids
          .map((jid) => "@" + normalizeJid(jid).split("@")[0])
          .join(" ");
        textToSend += "\n\n" + mentionsText;
      }
      await sock.sendMessage(chatId, {
        text: textToSend,
        contextInfo: { mentionedJid: mentionJids },
      });
      console.log(chalk.red(`👑 Primul mesaj trimis către ${chatId}`));
    } else {
      await sock.sendMessage(chatId, {
        image: config.photoBuffer,
        caption: config.photoCaption,
        contextInfo: { mentionedJid: mentionJids },
      });
      console.log(chalk.red(`👑 Poză trimisă către ${chatId}`));
    }
  } catch (err) {
    console.error(chalk.red("Eroare la trimiterea inițială:"), err);
  }

  sendLoop(chatId, sock);
}

/**
 * Oprește o sesiune activă
 */
function handleStopCommand(chatId) {
  if (activeSessions[chatId]) {
    activeSessions[chatId].running = false;
    console.log(chalk.red(`Sesiunea ${chatId} oprită.`));
  }
}

/**
 * Loop principal pentru trimitere
 */
async function sendLoop(chatId, sock) {
  const config = global.botConfig;
  const session = activeSessions[chatId];

  while (session?.running) {
    await delay(session.delay);
    try {
      if (config.sendType === "mesaje") {
        let textToSend = config.fullMessage;
        if (session.mentionJids.length) {
          const mentionsText = session.mentionJids
            .map((jid) => "@" + normalizeJid(jid).split("@")[0])
            .join(" ");
          textToSend += "\n\n" + mentionsText;
        }
        await sock.sendMessage(chatId, {
          text: textToSend,
          contextInfo: { mentionedJid: session.mentionJids }
        });
        console.log(chalk.red(`👑 Mesaj trimis către ${chatId}`));
      } else {
        await sock.sendMessage(chatId, {
          image: global.botConfig.photoBuffer,
          caption: global.botConfig.photoCaption,
          contextInfo: { mentionedJid: session.mentionJids }
        });
        console.log(chalk.red(`👑 Poză trimisă către ${chatId}`));
      }
    } catch (error) {
      console.error(chalk.red(`⇌ Eroare trimitere ${chatId}:`), error);
      console.log(chalk.red("⏳ Aștept revenirea internetului..."));
      await waitForInternet();
      console.log(chalk.red("🔄 Reinitialize connection"));
      return;
    }
  }

  delete activeSessions[chatId];
  console.log(chalk.red(`Sesiunea ${chatId} s-a încheiat.`));
}

/**
 * Reluarea sesiunilor după reconectare
 */
function resumeActiveSessions(sock) {
  for (const chatId in activeSessions) {
    if (activeSessions[chatId].running) {
      console.log(chalk.red(`Reluare sesiune ${chatId}...`));
      sendLoop(chatId, sock);
    }
  }
}

/**
 * Extrage mesajul din view-once
 */
function getInnerMessage(quotedMsg) {
  return quotedMsg.viewOnceMessage?.message || quotedMsg;
}

/**
 * Handle /play <query>: descarcă audio cu yt-dlp și trimite ca voice note
 */
async function handlePlayCommand(chatId, query, sock) {
  console.log(chalk.red(`[PlayCommand] Căutăm: ${query}`));

  // 1. Download raw audio (.m4a) via yt-dlp
  const tmpInput = path.join(os.tmpdir(), `input_${Date.now()}.m4a`);
  const tmpOgg   = path.join(os.tmpdir(), `audio_${Date.now()}.ogg`);
  const cmd      = `yt-dlp -f "bestaudio[ext=m4a]" -o "${tmpInput}" "ytsearch1:${query}"`;

  try {
    await new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error(chalk.red("[yt-dlp] Eroare execuție:"), stderr || err);
          return reject(err);
        }
        resolve();
      });
    });

    // 2. Ensure file exists
    if (!fs.existsSync(tmpInput)) {
      await sock.sendMessage(chatId, { text: `Nu am putut descărca audio pentru: ${query}` });
      return;
    }

    // 3. Convert to .ogg with libopus codec
    await new Promise((resolve, reject) => {
      ffmpeg(tmpInput)
        .audioCodec("libopus")
        .audioBitrate(128)
        .format("ogg")
        .outputOptions("-vn")
        .save(tmpOgg)
        .on("end", resolve)
        .on("error", reject);
    });

    // 4. Send voice note
    const buffer = fs.readFileSync(tmpOgg);
    await sock.sendMessage(chatId, { audio: buffer, ptt: true });
    console.log(chalk.red(`[PlayCommand] Voice note trimis pentru: ${query}`));

    // 5. Save locally
    const dlDir   = path.resolve("./downloads");
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir);
    const savePath = path.join(dlDir, `audio_${Date.now()}.ogg`);
    fs.writeFileSync(savePath, buffer);
    console.log(chalk.red(`[PlayCommand] Salvat local: ${savePath}`));
  } catch (err) {
    console.error(chalk.red("[PlayCommand] Eroare conversie:"), err);
    await sock.sendMessage(chatId, { text: `Eroare pregătire audio: ${query}` });
  } finally {
    if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
    if (fs.existsSync(tmpOgg))   fs.unlinkSync(tmpOgg);
  }
}

/**
 * Handle /sticker: transformă o poză citată într-un sticker
 */
async function handleStickerCommand(msg, sock) {
  const chatId = msg.key.remoteJid;
  const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted?.imageMessage) {
    return sock.sendMessage(chatId, { text: "Răspunde la o poză cu /sticker." });
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      { key: msg.key, message: quoted },
      "buffer", {},
      { logger: Pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
    );
  } catch (e) {
    console.error(chalk.red("[Sticker] Eroare descărcare:"), e);
    return;
  }

  const tmpIn  = path.join(os.tmpdir(), `in_${Date.now()}.jpg`);
  const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.webp`);
  fs.writeFileSync(tmpIn, buffer);

  exec(
    `ffmpeg -i "${tmpIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,format=rgba" -y "${tmpOut}"`,
    async (err) => {
      if (err) {
        console.error(chalk.red("[Sticker] Eroare ffmpeg:"), err);
      } else {
        const webp = fs.readFileSync(tmpOut);
        await sock.sendMessage(chatId, { sticker: webp });
        console.log(chalk.red("[Sticker] Trimis sticker."));
      }
      fs.unlinkSync(tmpIn);
      fs.unlinkSync(tmpOut);
    }
  );
}

/**
 * Configurează handler-ele pentru comenzi WhatsApp
 */
function setupCommands(sock) {
  sock.ev.on("messages.upsert", async (up) => {
    if (!up.messages) return;
    for (const msg of up.messages) {
      if (!msg.message || !msg.key.fromMe || !
global.configReady) continue;
      const chatId = msg.key.remoteJid;
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) continue;
      text = text.trim();

      // reacție hourglass
      if (text.startsWith("/") || text === ".vv") {
        try { await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } }); } catch {}
      }

      // .vv: resharing view-once
      if (text === ".vv") {
        const ctx = msg.message.extendedTextMessage?.contextInfo;
        if (!ctx?.quotedMessage) continue;
        try {
          const inner = getInnerMessage(ctx.quotedMessage);
          const fake = {
            key: {
              remoteJid: chatId,
              id: ctx.stanzaId || msg.key.id,
              fromMe: false,
              participant: ctx.participant,
            },
            message: inner,
          };
          const buf = await downloadMediaMessage(fake, "buffer", {},
            { logger: Pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage });
          let content = {};
          if (inner.imageMessage) content = { image: buf };
          else if (inner.videoMessage) content = { video: buf };
          else if (inner.audioMessage) content = { audio: buf };
          else continue;
          await sock.sendMessage(chatId, content);
        } catch (e) {
          console.error(chalk.red("Error .vv:"), e);
        }
        continue;
      }

      if (!text.startsWith("/")) continue;
      const cmd = text.toLowerCase();

      if (cmd === "/reload") {
        console.log(chalk.red("→ /reload nu afectează full-text mode."));
      } else if (cmd === "/ping") {
        await sock.sendMessage(chatId, { text: "✅ Botul e activ" });
      } else if (cmd === "/stats") {
        const s = Object.keys(activeSessions).length;
        const l = Object.keys(activeNameLoops).length;
        await sock.sendMessage(chatId, { text: `📊 Sesiuni: ${s} | Loop-uri: ${l}` });
      } else if (cmd === "/stopgroupname") {
        if (activeNameLoops[chatId]) delete activeNameLoops[chatId];
      } else if (cmd.startsWith("/groupname")) {
        const m = text.match(/^\/groupname(\d+)\s+(.+)$/i);
        if (m) {
          const secs = parseInt(m[1], 10) * 1000;
          const names = m[2].split(",").map(n => n.trim()).filter(n => n);
          if (names.length) {
            activeNameLoops[chatId] = { running: true, delay: secs, groupNames: names, currentIndex: 0 };
            groupNameLoop(chatId, sock);
          }
        }
      } else if (cmd.startsWith("/kick")) {
        if (!chatId.endsWith("@g.us")) continue;
        const toKick = text.split(/\s+/).slice(1).map(t => {
          let id = t.replace(/^@/, "");
          if (!id.includes("@")) id += "@s.whatsapp.net";
          return id;
        });
        if (toKick.length) await sock.groupParticipantsUpdate(chatId, toKick, "remove");
      } else if (cmd.startsWith("/add")) {
        if (!chatId.endsWith("@g.us")) continue;
        const toAdd = text.split(/\s+/).slice(1).map(t => {
          let id = t.replace(/^@/, "");
          if (!id.includes("@")) id += "@s.whatsapp.net";
          return id;  
        });
        if (toAdd.length) await sock.groupParticipantsUpdate(chatId, toAdd, "add");
      } else if (cmd === "/stop") {
        handleStopCommand(chatId);
      } else if (cmd.startsWith("/start")) {
        const m = text.match(/^\/start(\d*)\s*(.*)$/i);
        if (m) {
          const d = m[1] ? parseInt(m[1], 10) * 1000 : global.botConfig.defaultDelay;
          let mentions = [];
          const rem = m[2].trim();
          if (rem) {
            if (rem === "@all" && chatId.endsWith("@g.us")) {
              const md = await sock.groupMetadata(chatId).catch(() => null);
              mentions = md ? md.participants.map(p => p.id) : [];
            } else {
              mentions = rem.split(/\s+/)
                .filter(t => t.startsWith("@"))
                .map(t => {
                  let id = t.replace(/^@/, "");
                  if (!id.includes("@")) id += "@s.whatsapp.net";
                  return id;
                });
            }
          }
          handleStartCommand(chatId, d, mentions, sock);
        }
      } else if (cmd.startsWith("/play ")) {
        const query = text.slice(6).trim();
        if (query) await handlePlayCommand(chatId, query, sock);
      } else if (cmd === "/sticker") {
        const ctx = msg.message.extendedTextMessage?.contextInfo;
        if (ctx?.quotedMessage) {
          await handleStickerCommand(msg, sock);
        }
      }
    }
  });
}

/**
 * Inițializează configurația bot-ului
 */
async function initializeBotConfig(sock) {
  if (global.botConfig.sendType) {
    setupCommands(sock);
    return;
  }

  let sendType = await askQuestion("Ce vrei să trimiți? (mesaje/poze): ");
  sendType = sendType.toLowerCase();
  if (sendType !== "mesaje" && sendType !== "poze") {
    console.error(chalk.red("Opțiune invalidă!"));
    process.exit(1);
  }
  global.botConfig.sendType = sendType;

  if (sendType === "mesaje") {
    const textPath = await askQuestion("Calea către fișierul .txt (conținut full): ");
    if (!fs.existsSync(textPath)) {
      console.error(chalk.red("⛔ Fișierul nu există!"));
      process.exit(1);
    }
    global.botConfig.fullMessage = fs.readFileSync(textPath, "utf8");
  } else {
    const photoPath = await askQuestion("Calea către fișierul foto: ");
    if (!fs.existsSync(photoPath)) {
      console.error(chalk.red("⛔ Fișierul foto nu există!"));
      process.exit(1);
    }
    global.botConfig.photoBuffer = fs.readFileSync(photoPath);
    global.botConfig.photoCaption = await askQuestion("Caption (opțional): ");
  }

  global.botConfig.defaultDelay = 5000;
  console.log(chalk.red("\n✔ Configurare finalizată."));
  console.log(chalk.red(
    "👑 Folosește /start, /stop, /groupname, /stopgroupname, /add, /kick, .vv, /play, /sticker, /ping, /stats 👑"
  ));

  global.configReady = true;
  setupCommands(sock);
  resumeActiveSessions(sock);
}

/**
 * Pornește bot-ul WhatsApp
 */
async function startBot() {
  // Pre-check DNS
  try {
    await checkDNS();
  } catch (e) {
    console.log(chalk.red("❌ DNS nu rezolvă web.whatsapp.com. Aștept..."));
    await waitForInternet();
    return startBot();
  }

  console.log(chalk.red("🔍 Pornire bot WhatsApp..."));

  if (!global.connectionMethod) {
    console.log(chalk.red("=============================="));
    console.log(chalk.red("   Alege metoda de conectare:"));
    console.log(chalk.red("   1. Cod de asociere"));
    console.log(chalk.red("   2. Cod QR"));
    console.log(chalk.red("=============================="));
    global.connectionMethod = await askQuestion("Metoda (1 sau 2): ");
  }
  const choice = global.connectionMethod;
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  let sock;

  if (choice === "1") {
    sock = makeWASocket({ auth: state, logger: Pino({ level: "silent" }), connectTimeoutMs: 60000 });
    if (!sock.authState.creds.registered) {
      const pn = await askQuestion("Număr de telefon (ex: 407...): ");
      global.owner = normalizeJid(pn.includes("@") ? pn : `${pn}@s.whatsapp.net`);
      try {
        const code = await sock.requestPairingCode(pn);
        console.log(chalk.red(`Cod de asociere: ${code}`));
      } catch (e) {
        console.error(chalk.red("Eroare pairing code:"), e);
      }
    } else if (!global.owner && sock.user?.id) {
      global.owner = normalizeJid(sock.user.id);
    }
  } else if (choice === "2") {
    sock = makeWASocket({
      auth: state,
      logger: Pino({ level: "silent" }),
      connectTimeoutMs: 60000,
      printQRInTerminal: false
    });
    sock.ev.on("connection.update", upd => {
      if (upd.qr) {
        console.clear();
        console.log(chalk.red("\nScanează QR în WhatsApp > Linked Devices:\n"));
        qrcode.generate(upd.qr, { small: true });
      }
    });
  } else {
    console.error(chalk.red("Opțiune invalidă!"));
    process.exit(1);
  }

  sock.ws.on("error", async err => {
    if (err.code === "ENOTFOUND") {
      console.log(chalk.red("❌ WebSocket ENOTFOUND – aștept reconectarea..."));
      await waitForInternet();
      return startBot();
    } else {
      console.error(chalk.red("❌ WebSocket error:"), err);
    }
  });

  sock.ev.on("connection.update", async upd => {
    const { connection, lastDisconnect } = upd;
    const code = lastDisconnect?.error?.output?.statusCode;
    const msg  = lastDisconnect?.error?.message || "";
    const stale = msg.includes("ENOTFOUND");

    if (connection === "open") {
      console.log(chalk.red("✔ Conectat la WhatsApp!"));
      if (global.botConfig.sendType) {
        setupCommands(sock);
        resumeActiveSessions(sock);
      } else {
        await initializeBotConfig(sock);
      }
    } else if (connection === "close") {
      console.log(chalk.red("⏳ Conexiunea a fost pierdută."));
      if (code !== DisconnectReason.loggedOut || stale) {
        await waitForInternet();
        console.log(chalk.red("🔁 Reîncerc reconectarea..."));
        try { await startBot(); } catch (e) {
          console.error(chalk.red("❌ Eroare reconectare:"), e);
          setTimeout(startBot, 10000);
        }
      } else {
        console.log(chalk.red("⇌ Deconectare definitivă. Restart manual necesar."));
        process.exit(1);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

// Global error handlers
process.on("uncaughtException", err => console.error(chalk.red("❌ uncaughtException:"), err));
process.on("unhandledRejection", err => console.error(chalk.red("❌ unhandledRejection:"), err));

// Start the bot
startBot();
