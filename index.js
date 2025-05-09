const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
const port = 5000;

// WhatsApp Cloud API details
const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1';
const PHONE_NUMBER_ID = '625219257346961';
const VERIFY_TOKEN = 'WhatsAppBot123';

// Direct Line details
const DIRECT_LINE_SECRET = '4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb';
const conversations = {}; // Store convos by user

app.use(bodyParser.json());

// Webhook Verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook Receiver (POST)
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message && message.text) {
      const from = message.from; // WhatsApp user number
      const userText = message.text.body;
      console.log(`🧑 [${from}]: ${userText}`);

      // Start or reuse conversation
      if (!conversations[from]) {
        const startRes = await fetch("https://directline.botframework.com/v3/directline/conversations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${DIRECT_LINE_SECRET}`,
            "Content-Type": "application/json"
          }
        });
        const convoData = await startRes.json();
        conversations[from] = {
          conversationId: convoData.conversationId,
          watermark: null
        };
      }

      const conversationId = conversations[from].conversationId;

      // Send user message to bot
      await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DIRECT_LINE_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "message",
          from: { id: "user" },
          text: userText
        })
      });

      // Wait and get bot response
      setTimeout(async () => {
        const watermark = conversations[from].watermark || "";
        const botRes = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${watermark}`, {
          headers: {
            "Authorization": `Bearer ${DIRECT_LINE_SECRET}`
          }
        });
        const data = await botRes.json();
        conversations[from].watermark = data.watermark;

        const botMessages = data.activities.filter(a => a.from.id !== "user" && a.text);

        for (const msg of botMessages) {
          await sendWhatsAppMessage(from, msg.text);
          console.log(`🤖 [BOT]: ${msg.text}`);
        }
      }, 1000); // short delay to let bot respond
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Send message to WhatsApp via Meta Cloud API
async function sendWhatsAppMessage(to, message) {
  await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      text: { body: message }
    })
  });
}

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
