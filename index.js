const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs'); 

const app = express();
app.use(express.json());

let sock;
let currentQR = '';

async function startSock() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // JADOO 1: Backup Version System (Taaki Server Crash Na Ho)
        let version = [2, 3000, 1015901307]; // Backup version
        try {
            const fetched = await fetchLatestBaileysVersion();
            version = fetched.version;
            console.log(`WhatsApp Version fetched: ${version.join('.')}`);
        } catch (fetchError) {
            console.log('Version fetch fail hua, backup version use kar rahe hain.');
        }
        
        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false 
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                currentQR = qr;
                console.log('✅ QR Code Taiyar Hai! Ab apne browser me /qr wala page refresh karein.');
            }

            if (connection === 'close') {
                currentQR = ''; 
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Connection tut gaya (Code: ' + statusCode + ').');
                if (shouldReconnect) setTimeout(startSock, 2000); 
            } else if (connection === 'open') {
                currentQR = '';
                console.log('🚀 WhatsApp Engine is READY!');
            }
        });
    } catch (fatalError) {
        // JADOO 2: Ab code application ko exit nahi karega, balki log me error batayega
        console.error('STARTUP MEIN BADA ERROR:', fatalError);
    }
}

app.get('/qr', (req, res) => {
    if (!currentQR) {
        return res.send("<h2 style='font-family:sans-serif; text-align:center; margin-top:20%;'>QR Code abhi taiyar nahi hai ya scan ho chuka hai.</h2>");
    }
    res.send(`
        <html>
        <head><title>Scan WhatsApp QR</title></head>
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; background-color:#f0f2f5; font-family:sans-serif;">
            <h2>Scan this QR with WhatsApp Business</h2>
            <div id="qrcode" style="background:white; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <script>
                new QRCode(document.getElementById("qrcode"), { text: "${currentQR}", width: 256, height: 256 });
            </script>
        </body>
        </html>
    `);
});

// UPGRADED API ENDPOINT WITH SMART NUMBER CLEANING
app.post('/send-message', async (req, res) => {
    let { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).send('Number aur message dono chahiye!');
    }

    try {
        if (!sock) return res.status(500).send('Engine ready nahi hai');

        // Saare spaces aur plus hata kar clean number banana
        let cleanNumber = number.toString().replace(/\s+/g, '').replace('+', '');
        if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) {
            cleanNumber = '91' + cleanNumber;
        }

        const jid = cleanNumber + "@s.whatsapp.net";
        console.log(`Sending message to: ${jid}`);

        await sock.sendMessage(jid, { text: message });
        res.status(200).send('Message bhej diya gaya!');
    } catch (error) {
        console.error('Bhejne mein error:', error);
        res.status(500).send('Error aaya: ' + error.message);
    }
});

startSock();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
