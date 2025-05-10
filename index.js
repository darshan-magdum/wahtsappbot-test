const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fetch = require("node-fetch");
const cors = require("cors");
const mongoose = require('mongoose');

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
  

  //  In-memory storage
// const users = {
//   '10001': { name: 'John Doe', mobile: '9876543210', balance: 0, movies: [] },
//   '10002': { name: 'Jane Smith', mobile: '9123456789', balance: 50, movies: [] },
//   '10003': { name: 'Amit Sharma', mobile: '9811122233', balance: 100, movies: [] },
//   '10004': { name: 'Priya Verma', mobile: '9822233445', balance: 75, movies: [] },
//   '10005': { name: 'Rahul Mehta', mobile: '9833344556', balance: 30, movies: [] },
//   '10006': { name: 'Sneha Gupta', mobile: '9844455667', balance: 60, movies: [] },
//   '10007': { name: 'Karan Singh', mobile: '9855566778', balance: 25, movies: [] },
//   '10008': { name: 'Divya Patil', mobile: '9866677889', balance: 90, movies: [] },
//   '10009': { name: 'Ravi Iyer', mobile: '9877788990', balance: 10, movies: [] },
//   '10010': { name: 'Meena Desai', mobile: '9888899001', balance: 120, movies: [] }
// };


// const verifiedUsers = new Set();

// // Step 1: Verify Smartcard Number
// app.post('/verify-smartcard', (req, res) => {
//   const { smartcardNumber } = req.body;
//   if (users[smartcardNumber]) {
//     res.json({ message: 'Smartcard verified. Please enter mobile number.' });
//   } else {
//     res.status(400).json({ error: 'Invalid smartcard number.' });
//   }
// });

// // Step 2: Verify Mobile Number
// app.post('/verify-mobile', (req, res) => {
//   const { smartcardNumber, mobileNumber } = req.body;
//   const user = users[smartcardNumber];

//   if (user && user.mobile === mobileNumber) {
//     verifiedUsers.add(smartcardNumber);
//     res.json({
//       message: 'Verification successful.',
//       name: user.name,
//       smartcardNumber,
//       mobileNumber
//     });
//   } else {
//     res.status(400).json({ error: 'Mobile number does not match.' });
//   }
// });

// // Usecase 1: Add Movie
// app.post('/add-movie', (req, res) => {
//   const { smartcardNumber, movieName } = req.body;

//   if (!verifiedUsers.has(smartcardNumber)) {
//     return res.status(401).json({ error: 'User not verified.' });
//   }

//   users[smartcardNumber].movies.push(movieName);
//   res.json({ message: `Movie '${movieName}' added.` });
// });

// // Usecase 2: Add Top-Up Balance
// app.post('/add-balance', (req, res) => {
//   const { smartcardNumber, amount } = req.body;

//   if (!verifiedUsers.has(smartcardNumber)) {
//     return res.status(401).json({ error: 'User not verified.' });
//   }

//   users[smartcardNumber].balance += amount;
//   res.json({ message: `₹${amount} added.`, totalBalance: users[smartcardNumber].balance });
// });

// // Usecase 3: Get Balance
// app.get('/get-balance', (req, res) => {
//   const { smartcardNumber } = req.query;

//   if (!verifiedUsers.has(smartcardNumber)) {
//     return res.status(401).json({ error: 'User not verified.' });
//   }

//   res.json({
//     balance: users[smartcardNumber].balance,
//     movies: users[smartcardNumber].movies
//   });
// });


// MongoDB Connection
mongoose.connect(
  'mongodb+srv://darshanmagdum:tzj7SxsKHeZoqc14@whatsappbot-cluster.2wgzguz.mongodb.net/SmartcardApp?retryWrites=true&w=majority&appName=WhatsappBOT-CLUSTER',
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
).then(() => console.log('✅ MongoDB connected'))
 .catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema and Model
const userSchema = new mongoose.Schema({
  smartcardNumber: { type: String, unique: true },
  name: String,
  mobile: String,
  balance: Number,
  movies: [String],
});
const User = mongoose.model('User', userSchema);

// In-memory set to track verified users
const verifiedUsers = new Set();

// Step 1: Verify Smartcard Number
app.post('/verify-smartcard', async (req, res) => {
  const { smartcardNumber } = req.body;
  const user = await User.findOne({ smartcardNumber });

 if (user) {
  res.json({ 
    message: 'Smartcard verified. Please enter your mobile number.', 
    validation: true 
  });
} else {
  res.json({ 
    message: 'Smartcard is invalid.', 
    validation: false 
  });
}

});

// Step 2: Verify Mobile Number
app.post('/verify-mobile', async (req, res) => {
  const { smartcardNumber, mobileNumber } = req.body;
  const user = await User.findOne({ smartcardNumber });

  if (user && user.mobile === mobileNumber) {
  verifiedUsers.add(smartcardNumber);

  res.json({
    message: 'Verification successful.',
    name: user.name,
    smartcardNumber: smartcardNumber,
    mobileNumber: mobileNumber,
    validation: true
  });
} else {
  res.json({
    message: 'The provided mobile number does not match our records.',
    validation: false
  });
}

});

// Usecase 1: Add Movie
app.post('/add-movie', async (req, res) => {
  const { smartcardNumber, movieName } = req.body;

  if (!verifiedUsers.has(smartcardNumber)) {
    return res.json({
      message: 'User is not verified.',
      validation: false
    });
  }

  const user = await User.findOne({ smartcardNumber });

  if (user) {
    user.movies.push(movieName);
    await user.save();

    res.json({
      message: `Movie '${movieName}' added successfully.`,
      movieName,
      validation: true
    });
  } else {
    res.json({
      message: 'User not found in the system.',
      validation: false
    });
  }
});


// Usecase 2: Add Top-Up Balance
app.post('/add-balance', async (req, res) => {
  const { smartcardNumber, amount } = req.body;

  if (!verifiedUsers.has(smartcardNumber)) {
    return res.json({
      message: 'User not verified.',
      validation: false
    });
  }

  const user = await User.findOne({ smartcardNumber });
  if (user) {
    user.balance += amount;
    await user.save();

    res.json({
      message: `₹${amount} added successfully.`,
      totalBalance: user.balance,
      validation: true
    });
  } else {
    res.json({
      message: 'User not found.',
      validation: false
    });
  }
});


// Usecase 3: Get Balance and Movies
app.get('/get-balance', async (req, res) => {
  const { smartcardNumber } = req.query;

  if (!verifiedUsers.has(smartcardNumber)) {
    return res.json({
      message: 'User not verified.',
      validation: false
    });
  }

  const user = await User.findOne({ smartcardNumber });
  if (user) {
    res.json({
      balance: user.balance,
      movies: user.movies,
      validation: true
    });
  } else {
    res.json({
      message: 'User not found.',
      validation: false
    });
  }
});




// ✅ Start Server

const PORT = process.env.PORT || 3000;
app.listen(PORT , () => console.log(`server running on port ${PORT}`));
