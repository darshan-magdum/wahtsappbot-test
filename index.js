// Import required libraries
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO66j6nYIoUOYgD57tlKfcTjQKkbxCup4lXT4oj6GDv8MMKSPZAD2tEQdXFZAkwR2HFQrYZC5sFmiht8wjm3E8x9NuVmqsWglyj92JZC08YIwKSDGn0Xya1R4YTLS43F87Cb1AEDNnfRyKaJDZB0TQBipq13MiZCngwMzttA1zIvzGfRBXcNpyt3a6u9BoA6saMcEOEBuxk6bVb7ZAgZD'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Set the port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// 1. Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Verification token mismatch');
  }
});

// 2. Receiving Messages (POST)
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      entry.changes.forEach(change => {
        const message = change.value?.messages?.[0];
        if (message) {
          const senderId = message.from;
          const messageText = message.text?.body;

          if (messageText) {
            sendMessage(senderId, `Thanks for your message: ${messageText}`);
          }
        }
      });
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// 3. Sending Message Function
function sendMessage(to, message) {
  axios
    .post(
      `https://graph.facebook.com/v13.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    )
    .then((response) => {
      console.log('Message sent:', response.data);
    })
    .catch((error) => {
      console.error('Error sending message:', error.response?.data || error.message);
    });
}

// 4. Test endpoint
app.get('/greet', (req, res) => {
  res.status(200).json({ message: 'Hi, Dan!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
