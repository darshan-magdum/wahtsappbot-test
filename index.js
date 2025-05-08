const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const port = 5000;

const conversations = {};

const ACCESS_TOKEN = 'EAAWxjuZCQrhMBO1NUdXqZCQ13IZCqyZB6aP9uishp7pmqmy5Upv8KTeWlukpJWk6pqPWKAIjwXpU5M2WbZCm76XlWUH4uCyxXSUmeAzUIwuOPvbtumvf30rKlXqH8g62IJkdqm8sgo0bG1TA4yAHLKlMARv0BSZC1tceSAV9098jj0n9g3XF9nAlX1';
const PHONE_NUMBER_ID = '625219257346961';
const VERIFY_TOKEN = 'WhatsAppBot123';
const directLineSecret = '4bEHl4WbbsPZnu4Tq3APzAfGbKMVBM2uUEDw2dXyzZ4MDTZSPc03JQQJ99BEAC77bzfAArohAAABAZBS0118.G46ntCLcGwB772orOgAsylaVC25MW5sWNN8ZlS1vYlzxOMGQmFNgJQQJ99BEAC77bzfAArohAAABAZBS3CCb'; // <-- Replace this

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Start Bot Conversation ---
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

// --- Send Message to Bot ---
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
    res.status(500).json({ error: "Failed to send message to bot" });
  }
});

// --- Poll Bot Response ---
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

// --- WhatsApp Webhook Verification ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// --- WhatsApp Webhook Message Receiver ---
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object) {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message && message.text && message.from) {
      const userMessage = message.text.body;
      const from = message.from;

      console.log(`[2] Received from user (${from}): ${userMessage}`);

      // Ensure conversation ID for this user
      let conversationId;
      if (!conversations[from]) {
        const response = await fetch("https://directline.botframework.com/v3/directline/conversations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${directLineSecret}`,
            "Content-Type": "application/json"
          }
        });

        const data = await response.json();
        conversationId = data.conversationId;
        conversations[from] = { conversationId, watermark: null };

        console.log(`[3] New Direct Line conversation started for user ${from}:`, conversationId);
      } else {
        conversationId = conversations[from].conversationId;
        console.log(`[3] Existing conversation reused for user ${from}:`, conversationId);
      }

      // Send message to Copilot bot
      const payloadToCopilot = {
        type: "message",
        from: { id: "user" },
        text: userMessage
      };

      await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${directLineSecret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payloadToCopilot)
      });

      // Poll for bot response
      const botMessages = await getBotResponse(conversationId);

      const textMessages = botMessages
        .filter(msg => msg.type === "message" && msg.text)
        .map(msg => msg.text);

      if (textMessages.length > 0) {
        const finalReply = textMessages[textMessages.length - 1];
        await sendWhatsAppMessage(from, finalReply);
      } else {
        await sendWhatsAppMessage(from, "Sorry, I didn't understand that. Please try again.");
      }
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// --- Send Message to WhatsApp User ---
async function sendWhatsAppMessage(to, message) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: message },
      })
    });
    console.log(`Sent message to ${to}: ${message}`);
  } catch (error) {
    console.error(`Failed to send WhatsApp message to ${to}:`, error);
  }
}

// --- Get Bot Response ---
async function getBotResponse(conversationId) {
  // Ensure the conversation exists
  const conversation = conversations[conversationId];
  if (!conversation) {
    console.error(`No conversation found for conversationId: ${conversationId}`);
    return [];
  }

  const watermark = conversation.watermark || "";

  try {
    const response = await fetch(`https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities?watermark=${watermark}`, {
      headers: {
        "Authorization": `Bearer ${directLineSecret}`
      }
    });

    const data = await response.json();

    // Update the watermark if it's available
    if (data.watermark) {
      conversations[conversationId].watermark = data.watermark;
    }

    // Filter out only bot messages
    return data.activities.filter(activity => activity.from.id !== "user");
  } catch (error) {
    console.error("Failed to get bot response:", error);
    return [];
  }
}


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
