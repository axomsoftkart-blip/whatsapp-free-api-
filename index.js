const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs'); // Corrupt files delete karne ke liye native module

const app = express();
app.use(express.json());

let sock;
let currentQR = '';

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['MyWhatsAppBot', 'Chrome', '1.0.0'], // Yahan humne WhatsApp ko identity de di
        syncFullHistory: false // RAM bachane ke liye
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log('✅ QR Code Taiyar Hai! Ab apne browser me /qr wala page refresh karein.');
        }

        if (connection === 'close') {
            currentQR = ''; // Connection tutne par QR mita do
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log('❌ Connection tut gaya (Code: ' + statusCode + '). Dobara connect kar rahe hain...');
            
            if (shouldReconnect) {
                setTimeout(startSock, 2000); // 2 second baad automatically dobara try karega
            } else {
                console.log('🔴 Purana session kachra ho gaya hai, usey delete kar rahe hain...');
                if (fs.existsSync('./auth_info')) {
                    fs.rmSync('./auth_info', { recursive: true, force: true });
                }
                setTimeout(startSock, 2000);
            }
        } else if (connection === 'open') {
            currentQR = '';
            console.log('🚀 WhatsApp Engine is READY!');
        }
    });
}

app.get('/qr', (req, res) => {
    if (!currentQR) {
        return res.send("<h2 style='font-family:sans-serif; text-align:center; margin-top:20%;'>QR Code background mein ban raha hai... kripya apne Render Logs check karein aur tabhi refresh karein jab Logs mein '✅ QR Code Taiyar Hai!' likha aaye.</h2>");
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

app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).send('Number aur message dono chahiye!');
    }

    const jid = "91" + number + "@s.whatsapp.net";

    try {
        if (!sock) return res.status(500).send('Engine ready nahi hai');
        await sock.sendMessage(jid, { text: message });
        res.status(200).send('Message bheja gaya!');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error aaya');
    }
});

startSock();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
