const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false // Hum ise browser par dikhayenge
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            console.log('WhatsApp Engine is READY!');
        }
    });
}

// QR Code handle karne ke liye
app.get('/qr', async (req, res) => {
    // Baileys QR generate karne ka logic yahan aayega
    res.send("QR code generator setup ready. Kripya logs check karein.");
});

app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    const jid = "91" + number + "@s.whatsapp.net";
    try {
        await sock.sendMessage(jid, { text: message });
        res.status(200).send('Message bheja gaya!');
    } catch (error) {
        res.status(500).send('Error!');
    }
});

startSock();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
