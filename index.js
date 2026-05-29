const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;
let currentQR = '';

// Baileys WhatsApp Engine Setup
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false // Terminal me QR nahi dikhayenge, browser me dikhayenge
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Agar naya QR aata hai toh use variable me save karo
        if (qr) {
            currentQR = qr;
            console.log('New QR Generated! Go to /qr to scan.');
        }

        if (connection === 'close') {
            currentQR = '';
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startSock(); // Automatic reconnect logic
            }
        } else if (connection === 'open') {
            currentQR = '';
            console.log('WhatsApp Engine is READY! (Running on ultra-low RAM Baileys mode)');
        }
    });
}

// Browser par HD QR Code dikhane ka page
app.get('/qr', (req, res) => {
    if (!currentQR) {
        return res.send("<h2 style='font-family:sans-serif; text-align:center; margin-top:20%;'>QR Code abhi taiyar nahi hai, ya phir pehle hi scan ho chuka hai. Kripya 10-15 second baad page refresh karein.</h2>");
    }
    res.send(`
        <html>
        <head><title>Scan WhatsApp QR</title></head>
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; background-color:#f0f2f5; font-family:sans-serif;">
            <h2>Scan this QR with WhatsApp Business</h2>
            <div id="qrcode" style="background:white; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <script>
                new QRCode(document.getElementById("qrcode"), {
                    text: "${currentQR}",
                    width: 256,
                    height: 256,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                });
            </script>
        </body>
        </html>
    `);
});

// Google Apps Script se data lene wala API Endpoint
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).send('Number aur message dono chahiye!');
    }

    // Baileys ka India ka number format: 91XXXXXXXXXX@s.whatsapp.net
    const jid = "91" + number + "@s.whatsapp.net";

    try {
        if (!sock) {
            return res.status(500).send('WhatsApp engine abhi ready nahi hai.');
        }
        await sock.sendMessage(jid, { text: message });
        res.status(200).send('Message bhej diya gaya!');
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Message bhejne mein dikkat aayi.');
    }
});

// Engine ko chalu karna
startSock();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
