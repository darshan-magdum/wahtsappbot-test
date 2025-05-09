const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());



// Set your WhatsApp Business API credentials
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Direct Line credentials
const DIRECT_LINE_SECRET = "4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb"; // Replace with your actual Direct Line Secret

// To store conversation state
let conversations = {};

// ✅ Webhook verification (for Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Webhook for incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messageObj = value?.messages?.[0];

    if (messageObj) {
      const from = messageObj.from;
      const userText = messageObj.text?.body;

      // Start or resume Direct Line conversation
      if (!conversations[from]) {
        const startRes = await fetch("https://directline.botframework.com/v3/directline/conversations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIRECT_LINE_SECRET}`,
            "Content-Type": "application/json"
          }
        });

        const startData = await startRes.json();
        conversations[from] = { conversationId: startData.conversationId, watermark: null };
      }

      const { conversationId, watermark } = conversations[from];

      // Send user message to the bot
      await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
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

      // Poll bot response
      const botRes = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${watermark || ""}`, {
        headers: {
          Authorization: `Bearer ${DIRECT_LINE_SECRET}`
        }
      });

      const botData = await botRes.json();
      if (botData.watermark) {
        conversations[from].watermark = botData.watermark;
      }

      const botMessages = botData.activities.filter(msg => msg.from.id !== "user" && msg.text);
      const botReply = botMessages[0]?.text || "Sorry, I didn’t get that.";

      // ✅ Send bot response back to user via WhatsApp
      const payload = {
        messaging_product: "whatsapp",
        to: from,
        text: {
          body: botReply
        }
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
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error:", error.message);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
