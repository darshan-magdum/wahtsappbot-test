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
const DIRECTLINE_SECRET = "4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb"; // Replace with your actual Direct Line Secret

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

          // Handle text messages
          if (message.type === "text") {
            const messageText = message.text?.body;
            if (messageText) {
              const botReply = await sendToBot(messageText);
              sendMessage(senderId, botReply);
            }

          // Handle voice messages
          } else if (message.type === "audio") {
            const mediaId = message.audio?.id;
            if (mediaId) {
              await handleVoiceMessage(mediaId, senderId);
            }

          // Fallback for unsupported message types
          } else {
            sendMessage(senderId, "Sorry, I can only understand text and voice messages at the moment.");
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

// Function to handle voice messages
async function handleVoiceMessage(mediaId, senderId) {
  try {
    // Step 1: Get media URL from WhatsApp API
    const mediaUrlRes = await axios.get(
      `https://graph.facebook.com/v17.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      }
    );
    const mediaUrl = mediaUrlRes.data.url;

    // Step 2: Download the actual voice message
    const audioRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });

    const azureRes = await axios.post(
      `https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
      audioRes.data,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': '40K84vS2b0E637v9J0qtz4MEpA7bsjaoRBg9DjQY9A3wjcptJ9o1JQQJ99BCACYeBjFXJ3w3AAAYACOG2sOr', // Replace with your Azure subscription key
          'Content-Type': 'audio/ogg; codecs=opus',
          'Transfer-Encoding': 'chunked',
        },
      }
    );

    const text = azureRes.data.DisplayText;
    console.log("Transcribed Text:", text);

    // Step 4: Forward transcribed text to your bot
    const botReply = await sendToBot(text);
    sendMessage(senderId, botReply);

  } catch (err) {
    console.error("Error handling voice message:", err.response?.data || err.message);
    sendMessage(senderId, "Sorry, I couldn't process your voice message.");
  }
}

// Send message to Copilot Studio bot via Direct Line
let watermark = null;

async function sendToBot(userMessage) {
  try {
    if (!conversationId) {
      const response = await axios.post(DIRECTLINE_API_URL, {}, {
        headers: { Authorization: `Bearer ${DIRECTLINE_SECRET}` },
      });
      conversationId = response.data.conversationId;
      console.log("Conversation Created:", conversationId);
    }

    // Send message to bot
    await axios.post(`${DIRECTLINE_API_URL}/${conversationId}/activities`, {
      type: "message",
      from: { id: "user1" },
      text: userMessage,
    }, {
      headers: { Authorization: `Bearer ${DIRECTLINE_SECRET}` },
    });

    // Wait for bot reply (polling)
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const url = watermark
      ? `${DIRECTLINE_API_URL}/${conversationId}/activities?watermark=${watermark}`
      : `${DIRECTLINE_API_URL}/${conversationId}/activities`;

    const botResponse = await axios.get(url, {
      headers: { Authorization: `Bearer ${DIRECTLINE_SECRET}` },
    });

    watermark = botResponse.data.watermark;

    const botMessages = botResponse.data.activities.filter(
      (activity) => activity.from.id !== "user1" && activity.type === "message"
    );

    if (botMessages.length > 0) {
      const botReply = botMessages.map(m => m.text).join('\n');
      console.log("Bot Reply:", botReply);
      return botReply;
    } else {
      return "No new response from bot";
    }

  } catch (error) {
    console.error("Error in sendToBot:", error.response?.data || error.message);
    return "Failed to send message to bot";
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
