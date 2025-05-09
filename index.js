




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
    const userText = messageObj.text?.body;

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

// ✅ Start Server
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
