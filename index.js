// Import required libraries
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAwMHmajCHQBO9oLRA0GseWpi9PK3zT55JsECFDCrZBQenZCsrMtWMUMGHdWpIybfwIQTCzC1ovO0ZCPnQzLu1daYVHHfKzoQMne8y6SetUg4DWukwbpJp0PF8ZC5SlfiZCVgtMJnU4viwKkPs4j7ZBsOU0e1wB6KuLr5v5k28NMETUgrdgnuhOccfCk6v3AFfsZAsWK08RroEXWunkowMQ7zHlicIZD'; // Your WhatsApp Access Token
const PHONE_NUMBER_ID = '625219257346961'; // Your WhatsApp Phone Number ID

// Set the port for your server
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming requests
app.use(bodyParser.json());

// 1. Webhook verification route
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'WhatsAppBot123'; // Your Webhook Verify Token

  // Check the token sent in the query string to verify
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.send('Error, wrong validation token');
  }
});

// 2. Webhook POST route to receive messages
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Check if the body is from a page (Facebook Pages)
  if (body.object === 'whatsapp') {
    body.entry.forEach(function(entry) {
      const messaging = entry.messaging[0];

      // Get the phone number of the sender
      const senderId = messaging.sender.id;
      
      // Get the message text
      const messageText = messaging.message.text;

      // Respond to the message
      if (messageText) {
        sendMessage(senderId, 'Thanks for your message: ' + messageText);
      }
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// 3. Function to send message via WhatsApp
function sendMessage(phoneNumberId, message) {
  axios
    .post(
      `https://graph.facebook.com/v13.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumberId,
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
      console.error('Error sending message:', error.response.data);
    });
}


app.get('/greet', (req, res) => {
    res.status(200).json({
      message: "Hi, Dan!", // Static message
    });
  });
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
