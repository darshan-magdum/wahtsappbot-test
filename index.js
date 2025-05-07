// Import required libraries
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Direct Line credentials
const DIRECTLINE_SECRET = "qEyAQSHjjFw.o4MGhA9CqzvEC9mUk5Slhupl-8Hx2ntf7ZTlXPhvLmU"; // Replace with your actual Direct Line Secret
const DIRECTLINE_API_URL = "https://directline.botframework.com/v3/directline/conversations";

// Store conversation ID globally
let conversationId = null;

// Set the port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Verification token mismatch');
  }
});

// Receiving Messages (POST)
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(async (entry) => {
      entry.changes.forEach(async (change) => {
        const message = change.value?.messages?.[0];
        if (message) {
          const senderId = message.from;
          const messageText = message.text?.body;

          if (messageText) {
            // Send the WhatsApp message to the bot via Direct Line
            const botReply = await sendToBot(messageText);
            
            // Send the bot's response back to the WhatsApp user
            sendMessage(senderId, botReply);
          }
        }
      });
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Send message to WhatsApp user
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

// Send message to Copilot Studio bot via Direct Line
async function sendToBot(userMessage) {
  try {
    // Start or continue conversation with Direct Line
    if (!conversationId) {
      const response = await axios.post(DIRECTLINE_API_URL, {}, {
        headers: { Authorization: `Bearer ${DIRECTLINE_SECRET}` },
      });
      conversationId = response.data.conversationId;
      console.log("Conversation Created:", conversationId);
    }

    // Send message to the bot via Direct Line
    await axios.post(`${DIRECTLINE_API_URL}/${conversationId}/activities`, {
      type: "message",
      from: { id: "user1" }, // User ID
      text: userMessage,
    }, {
      headers: { Authorization: `Bearer ${DIRECTLINE_SECRET}` },
    });

    // Poll for the bot's response
    const botResponse = await axios.get(`${DIRECTLINE_API_URL}/${conversationId}/activities`, {
      headers: { Authorization: `Bearer ${DIRECTLINE_SECRET}` },
    });

    // Find the bot's response
    const botMessages = botResponse.data.activities.filter(
      (activity) => activity.from.id !== "user1"
    );

    if (botMessages.length > 0) {
      const botReply = botMessages[botMessages.length - 1].text;
      console.log("Bot Reply:", botReply);
      return botReply; // Send bot response back to user
    } else {
      return "No response from bot";
    }
  } catch (error) {
    console.error("Error:", error);
    return "Failed to send message to bot";
  }
}

// Test endpoint
app.get('/greet', (req, res) => {
  res.status(200).json({ message: 'Hi, Dan1!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
