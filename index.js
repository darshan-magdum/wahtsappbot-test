const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
const port = 5000;

// WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Direct Line credentials
const directLineSecret = "4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb"; // Replace with your actual Direct Line Secret


// Set up port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Conversations to track state with Copilot Studio bot
let conversations = {};

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Verification token mismatch');
  }
});

// Receiving Messages from WhatsApp (POST)
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
              // Send the text message to the Copilot bot
              startConversation(senderId, messageText);
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

// Function to start a conversation with the Copilot Studio bot
async function startConversation(senderId, messageText) {
  try {
    // Start a new conversation with the Copilot bot
    const response = await fetch("https://directline.botframework.com/v3/directline/conversations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${directLineSecret}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    const conversationId = data.conversationId;
    conversations[conversationId] = { watermark: null };

    // Send the user's message to the Copilot bot
    await sendMessageToBot(conversationId, messageText);

    // Get and send bot's response
    await pollBotMessages(conversationId, senderId);
  } catch (error) {
    console.error("Error starting conversation with Copilot bot:", error);
  }
}

// Send message to the Copilot bot
async function sendMessageToBot(conversationId, messageText) {
  try {
    await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${directLineSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "message",
        from: { id: "user" },
        text: messageText
      })
    });
  } catch (error) {
    console.error("Error sending message to Copilot bot:", error);
  }
}

// Poll bot responses
async function pollBotMessages(conversationId, senderId) {
  const watermark = conversations[conversationId]?.watermark || "";
  try {
    const response = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${watermark}`, {
      headers: {
        "Authorization": `Bearer ${directLineSecret}`
      }
    });

    const data = await response.json();
    if (data.watermark) {
      conversations[conversationId].watermark = data.watermark;
    }

    const botMessages = data.activities.filter(activity => activity.from.id !== "user");
    if (botMessages.length > 0) {
      sendMessage(senderId, botMessages[0].text);
    }
  } catch (error) {
    console.error("Error receiving messages from Copilot bot:", error);
  }
}

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

    // Step 3: Send audio to Azure's Speech API for recognition
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

    // Step 4: Send transcribed text as a reply
    sendMessage(senderId, `You said: ${text}`);

  } catch (err) {
    console.error("Error handling voice message:", err.response?.data || err.message);
    sendMessage(senderId, "Sorry, I couldn't process your voice message.");
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
