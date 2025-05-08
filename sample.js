const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
const port = 5000;

const directLineSecret = "YOUR_DIRECT_LINE_SECRET"; // Replace with your actual secret

app.use(cors());
app.use(express.json());

let conversations = {};

// Start a new conversation
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

    // Filter out messages not from the bot
    const botMessages = data.activities.filter(activity => activity.from.id !== "user");
    res.json(botMessages);
  } catch (error) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
