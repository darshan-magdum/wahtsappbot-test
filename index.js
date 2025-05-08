const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
const port = 5000;


const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1'; // Replace with your actual token
const PHONE_NUMBER_ID = '625219257346961'; // Replace with your number ID

// Webhook verification token
const VERIFY_TOKEN = 'WhatsAppBot123';  // Use this in your Meta app webhook settings

// Direct Line credentials
const directLineSecret = "4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb"; // Replace with your actual Direct Line Secret



app.use(cors());
app.use(express.json());

let conversations = {};

// ✅ WhatsApp Webhook Verification
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

// ✅ Handle incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
  const entry = req.body.entry?.[0];
  const message = entry?.changes?.[0]?.value?.messages?.[0];
  const from = message?.from;
  const userText = message?.text?.body;

  if (from && userText) {
    console.log(`Received message from ${from}: ${userText}`);

    // Start a new conversation if not present
    if (!conversations[from]) {
      const response = await fetch("https://directline.botframework.com/v3/directline/conversations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${directLineSecret}`,
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      conversations[from] = { conversationId: data.conversationId, watermark: null };
    }

    const conversationId = conversations[from].conversationId;

    // Send user's message to bot
    await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${directLineSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "message",
        from: { id: from },
        text: userText
      })
    });

    // Wait and fetch bot's reply
    setTimeout(async () => {
      const watermark = conversations[from].watermark || "";
      const botResponse = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${watermark}`, {
        headers: {
          "Authorization": `Bearer ${directLineSecret}`
        }
      });

      const data = await botResponse.json();
      if (data.watermark) {
        conversations[from].watermark = data.watermark;
      }

      const botMessages = data.activities.filter(a => a.from.id !== from);
      for (const msg of botMessages) {
        if (msg.text) {
          await sendWhatsAppMessage(from, msg.text);
        }
      }
    }, 1500);

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ✅ Function to send message back to WhatsApp
async function sendWhatsAppMessage(to, text) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      text: { body: text }
    })
  });
}

// ✅ Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
