const express = require("express");
const fetch = require("node-fetch");
const axios = require("axios");
const cors = require("cors");
const app = express();
const port = 5000;

// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Direct Line credentials
const directLineSecret = "4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb"; // Replace with your actual Direct Line Secret
app.use(cors());
app.use(express.json());

let conversations = {};

// ---------- BOT CONVERSATION HANDLERS ---------- //

// Start a new Direct Line conversation
app.post("/start", async (req, res) => {
  try {
    const response = await fetch("https://directline.botframework.com/v3/directline/conversations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${directLineSecret}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    conversations[data.conversationId] = { watermark: null };
    res.json({ conversationId: data.conversationId });
  } catch (error) {
    res.status(500).json({ error: "Failed to start conversation" });
  }
});

// Send a message to the bot
app.post("/send", async (req, res) => {
  const { conversationId, message } = req.body;

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
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Poll bot responses
app.get("/receive/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
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
    res.json(botMessages);
  } catch (error) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// ---------- WHATSAPP INTEGRATION ---------- //

// WhatsApp webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive WhatsApp messages
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message && message.text && message.from) {
      const userMessage = message.text.body;
      const fromNumber = message.from;

      // 1. Start a new Direct Line conversation
      const start = await fetch("https://directline.botframework.com/v3/directline/conversations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${directLineSecret}`,
          "Content-Type": "application/json"
        }
      });
      const convData = await start.json();
      const conversationId = convData.conversationId;

      // 2. Send the message to the bot
      await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${directLineSecret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "message",
          from: { id: "user" },
          text: userMessage
        })
      });

      // 3. Wait and get the bot response
      setTimeout(async () => {
        const botResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
          headers: {
            "Authorization": `Bearer ${directLineSecret}`
          }
        });

        const botData = await botResponse.json();
        const botMessages = botData.activities.filter(act => act.from.id !== "user");

        if (botMessages.length > 0) {
          const reply = botMessages[0].text;

          // 4. Send the bot's reply back to WhatsApp
          await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to: fromNumber,
            text: { body: reply }
          }, {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            }
          });
        }
      }, 2000); // Wait 2 seconds for bot to respond
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error in WhatsApp webhook:", err);
    res.sendStatus(500);
  }
});

// ---------- SERVER ---------- //
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
