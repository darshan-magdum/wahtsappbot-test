const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fetch = require('node-fetch'); // Add node-fetch for the bot communication
const cors = require('cors'); // For CORS support

const app = express();

// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Direct Line secret for Copilot Studio Bot
const directLineSecret = '4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb'; // Replace with your actual secret

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Set the port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Conversation management for Copilot bot
let conversations = {};

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

          // Handle text messages
          if (message.type === "text") {
            const messageText = message.text?.body;
            if (messageText) {
              // Start a new conversation or send message to existing one
              let conversationId;
              if (!conversations[senderId]) {
                // Start a new conversation with Copilot Bot
                const startConversation = await startConversation();
                conversationId = startConversation.conversationId;
                conversations[senderId] = conversationId;
              } else {
                conversationId = conversations[senderId];
              }

              // Send message to Copilot bot
              const botResponse = await sendMessageToBot(conversationId, messageText);
              const botReply = botResponse[0]?.text;  // Get the bot's first reply

              if (botReply) {
                // Send bot reply back to WhatsApp
                sendMessage(senderId, botReply);
              } else {
                sendMessage(senderId, "Sorry, I couldn't understand your message.");
              }
            }
          } else {
            sendMessage(senderId, "Sorry, I can only understand text messages at the moment.");
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

// Start a new conversation with Copilot Studio bot
async function startConversation() {
  try {
    const response = await fetch("https://directline.botframework.com/v3/directline/conversations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${directLineSecret}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    return { conversationId: data.conversationId };
  } catch (error) {
    console.error('Error starting conversation:', error);
    return { error: 'Failed to start conversation' };
  }
}

// Send a message to the Copilot bot and receive its response
async function sendMessageToBot(conversationId, message) {
  try {
    const response = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${directLineSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "message",
        from: { id: "user" },
        text: message
      })
    });

    const data = await response.json();
    return data.activities.filter(activity => activity.from.id !== 'user'); // Filter bot's response
  } catch (error) {
    console.error('Error sending message to bot:', error);
    return [];
  }
}

// Test endpoint
app.get('/greet', (req, res) => {
  res.status(200).json({ message: 'Hi!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
