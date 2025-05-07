// Import required libraries
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { DirectLine } = require('botframework-directlinejs');

const app = express();

// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1';
const PHONE_NUMBER_ID = '625219257346961';
const VERIFY_TOKEN = 'WhatsAppBot123';
const DIRECT_LINE_SECRET = 'qEyAQSHjjFw.N4URSFFvMqlgyBQT-FFmZoeDP4YCc_KgKNVTPUAEXds'; // <-- Replace this

const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

// In-memory session map (for one DirectLine instance per WhatsApp user)
const sessions = new Map();

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Verification token mismatch');
  }
});

// Webhook for incoming WhatsApp messages (POST)
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      entry.changes.forEach(change => {
        const message = change.value?.messages?.[0];
        if (message) {
          const senderId = message.from;
          const messageText = message.text?.body;
          const messageAudio = message.audio?.id;

          if (messageText) {
            forwardToCopilotBot(senderId, messageText);
          } else if (messageAudio) {
            handleVoiceMessage(messageAudio, senderId);
          }
        }
      });
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Function to send message to WhatsApp
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
    const mediaUrlRes = await axios.get(
      `https://graph.facebook.com/v17.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      }
    );
    const mediaUrl = mediaUrlRes.data.url;

    const audioRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });

    const azureRes = await axios.post(
      `https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
      audioRes.data,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': '40K84vS2b0E637v9J0qtz4MEpA7bsjaoRBg9DjQY9A3wjcptJ9o1JQQJ99BCACYeBjFXJ3w3AAAYACOG2sOr',
          'Content-Type': 'audio/ogg; codecs=opus',
          'Transfer-Encoding': 'chunked',
        },
      }
    );

    const text = azureRes.data.DisplayText;
    console.log("Transcribed:", text);
    forwardToCopilotBot(senderId, text);
  } catch (err) {
    console.error("Error handling voice:", err.response?.data || err.message);
    sendMessage(senderId, `Sorry, I couldn't understand your voice message.`);
  }
}

// Function to forward message to Copilot Studio bot
function forwardToCopilotBot(senderId, text) {
  if (!sessions.has(senderId)) {
    const directLine = new DirectLine({ secret: DIRECT_LINE_SECRET });
    sessions.set(senderId, directLine);

    directLine.activity$.subscribe(activity => {
      if (activity.from.id !== senderId && activity.type === 'message' && activity.text) {
        sendMessage(senderId, activity.text);
      }
    });
  }

  const directLine = sessions.get(senderId);

  directLine.postActivity({
    from: { id: senderId, name: 'whatsapp-user' },
    type: 'message',
    text: text,
  }).subscribe(
    id => console.log('Posted to bot, activity ID:', id),
    error => console.error('Error posting to bot:', error)
  );
}

// Test endpoint
app.get('/greet', (req, res) => {
  res.status(200).json({ message: 'Hi, Darshan!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
