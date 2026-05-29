const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.json());

// Naya variable QR code save karne ke liye
let currentQR = '';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => {
    console.log('QR generated! Go to /qr to scan it.');
    currentQR = qr; // Code ne naya QR string pakad kar save kar liya
});

client.on('ready', () => {
    console.log('WhatsApp Engine is READY!');
    currentQR = ''; // Scan hote hi memory clear kar do
});

// Ye hai hamara naya jadoo: URL par HD QR Code dikhana
app.get('/qr', (req, res) => {
    if (!currentQR) {
        return res.send("<h2 style='font-family:sans-serif; text-align:center; margin-top:20%;'>QR Code abhi taiyar nahi hai, ya phir pehle hi scan ho chuka hai. Kripya 10-15 second baad page refresh karein.</h2>");
    }
    // Ye code browser par ek perfect scannable image banayega
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
    const number = req.body.number;
    const message = req.body.message;

    if (!number || !message) {
        return res.status(400).send('Number aur message dono chahiye!');
    }

    const formattedNumber = "91" + number + "@c.us"; 

    try {
        await client.sendMessage(formattedNumber, message);
        res.status(200).send('Message bhej diya gaya!');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Message bhejne mein dikkat aayi.');
    }
});

client.initialize();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
