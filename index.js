const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// WhatsApp API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID
const VERIFY_TOKEN = 'WhatsAppBot123'; 

// Direct Line API
const BASE_URL = "https://directline.botframework.com/v3/directline";
const DIRECT_LINE_SECRET = "qEyAQSHjjFw.o4MGhA9CqzvEC9mUk5Slhupl-8Hx2ntf7ZTlXPhvLmU"; // Replace with your Direct Line Secret


// Store conversations
let conversations = {};

// ✅ Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ✅ Message Handler
app.post("/webhook", async (req, res) => {
  try {
    const messageObj = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!messageObj) return res.sendStatus(200); // No message to process

    const from = messageObj.from;
    //************************************************************************************************************************
    const body = req.body;
   let userText;
for (const entry of body.entry) {
  for (const change of entry.changes) {
    const message = change.value?.messages?.[0];
    if (message) {
      const senderId = message.from;
      const messageText = message.text?.body;
      const messageAudio = message.audio?.id;

      if (messageText) {
        userText = messageText;
      } else if (messageAudio) {
        userText = await handleVoiceMessage(messageAudio, senderId); // ✅ FIXED
      }
    }
  }
}
   
    
    //************************************************************************************************************************

    // const userText = messageObj.text?.body;

    // Start or resume Direct Line conversation
    if (!conversations[from]) {
      const convRes = await fetch(`${BASE_URL}/conversations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DIRECT_LINE_SECRET}`,
          "Content-Type": "application/json"
        }
      });
      const convData = await convRes.json();
      conversations[from] = { conversationId: convData.conversationId };
    }

    // Send message to bot
    const sendMessageRes = await fetch(`${BASE_URL}/conversations/${conversations[from].conversationId}/activities`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIRECT_LINE_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "message",
        from: { id: "user" },
        text: userText
      })
    });

    const replyData = await sendMessageRes.json();
    const fullId = replyData.id;
    let watermark = fullId?.split("|")[1] || null;
    let botReply = null;
    let retries = 0;

    while (!botReply && retries < 10) {
      const url = `${BASE_URL}/conversations/${conversations[from].conversationId}/activities${watermark ? `?watermark=${watermark}` : ""}`;
      let response;

      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${DIRECT_LINE_SECRET}`
          }
        });
      } catch (err) {
        console.error("Error fetching activities:", err.message);
        break;
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        console.error("Invalid JSON from bot:", err.message);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retries++;
        continue;
      }

      watermark = data.watermark;

      if (data.activities?.length > 0) {
        const botMessages = data.activities.filter(
          (a) => a.from.id !== "user" && a.type === "message"
        );

        if (botMessages.length > 0) {
          botReply = botMessages.map(msg => msg.text).join(" ");
        }
      }

      if (!botReply) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retries++;
      }
    }

    botReply = botReply || "Sorry, I didn’t get that.";

    // ✅ Send reply to WhatsApp
    const payload = {
      messaging_product: "whatsapp",
      to: from,
      text: { body: botReply }
    };

    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.sendStatus(500);
  }
});

// send message function which is not useful
// function sendMessage(to, message) {
//   axios
//     .post(
//       `https://graph.facebook.com/v13.0/${PHONE_NUMBER_ID}/messages`,
//       {
//         messaging_product: 'whatsapp',
//         to: to,
//         text: { body: message },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${ACCESS_TOKEN}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     )
//     .then((response) => {
//       console.log('Message sent:', response.data);
//     return response.data
//     })
//     .catch((error) => {
//       return console.error('Error sending message:', error.response?.data || error.message);
//     });
// }

//handleVoiceMessage function
async function handleVoiceMessage(mediaId, senderId) {
    try {
      // Step 1: Get audio URL from Meta API
      const mediaUrlRes = await axios.get(
        `https://graph.facebook.com/v17.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
          },
        }
      );
      const mediaUrl = mediaUrlRes.data.url;
  
      // Step 2: Download audio binary
      const audioRes = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        responseType: 'arraybuffer',
      });
  
      // Step 3: Send audio to Azure Speech-to-Text
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
      return text
      // Step 4: Reply to sender
      // sendMessage(senderId, `${text}`);
    } catch (err) {
      console.error("Error handling voice:", err.response?.data || err.message);
      // sendMessage(senderId, `Sorry, I couldn't understand your voice message.`);
    }
  }
  


// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
