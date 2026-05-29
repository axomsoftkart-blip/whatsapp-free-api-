const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json()); // JSON data read karne ke liye

// WhatsApp Client setup (LocalAuth use kar rahe hain taaki QR ek baar scan ho aur save rahe)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] } // Render par chalane ke liye zaroori
});

// QR Code generate hone par kya karna hai
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

// Jab WhatsApp connect ho jaye
client.on('ready', () => {
    console.log('WhatsApp Engine is READY!');
});

// API Endpoint ban banana jo Apps Script se data lega
app.post('/send-message', async (req, res) => {
    const number = req.body.number; // Customer ka number
    const message = req.body.message; // Message text

    if (!number || !message) {
        return res.status(400).send('Number aur message dono chahiye!');
    }

    // WhatsApp ka format (91XXXXXXXXXX@c.us)
    const formattedNumber = "91" + number + "@c.us"; 

    try {
        await client.sendMessage(formattedNumber, message);
        res.status(200).send('Message bhej diya gaya!');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Message bhejne mein dikkat aayi.');
    }
});

// WhatsApp client ko start karna
client.initialize();

// Server ko chalu rakhna
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});