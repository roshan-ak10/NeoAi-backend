import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Vault!"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

const chatSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  history: { type: Array, default: [] } 
});

const ChatSession = mongoose.model("ChatSession", chatSchema);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-lite",
    systemInstruction: "You are NeoAI, a helpful assistant. You must answer queries directly, concisely, and in simple English. STRICT RULES: 1. NEVER introduce yourself (Do not say 'Hello, I am NeoAI'). 2. NEVER use conversational filler or ask follow-up questions. 3. NEVER use ocean-themed puns or metaphors. Provide ONLY the direct answer to the user's prompt.",
    tools: [
      {
        googleSearch: {}
      }
    ]
});

app.post("/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ reply: "Hold up! You need a session ID." });
        }

        console.log(`Received from [${sessionId.substring(0,6)}...]:`, message);

        let userRecord = await ChatSession.findOne({ sessionId });
        
        if (!userRecord) {
            userRecord = new ChatSession({ sessionId, history: [] });
        }

        const userChat = model.startChat({ 
            history: userRecord.history 
        });

        const result = await userChat.sendMessage(message);
        const botReply = result.response.text();

        userRecord.history = await userChat.getHistory();
        await userRecord.save();
        
        res.json({ reply: botReply });
    } 
    catch (error) {
        console.error("BACKEND ERROR:", error); 
        
        if (error.status === 503) {
            return res.status(503).json({ reply: "My AI servers are currently busy. Give me a few seconds and try again." });
        }

        if (error.status === 429) {
            return res.status(429).json({ reply: "We hit a speed limit. Google's free tier only allows a few messages per minute. Wait about 30 seconds and try again!" });
        }

        res.status(500).json({ reply: "Oops!Our server encountered an unexpected condition that prevented it from fulfilling the request"});
    }
});

app.post("/reset", async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (sessionId) {
            await ChatSession.deleteOne({ sessionId });
            console.log(`Wiped database memory for user: ${sessionId.substring(0,6)}...`);
        }
        
        res.json({ message: "Memory wiped!" });
    } catch (error) {
        console.error("RESET ERROR:", error);
        res.status(500).json({ error: "Failed to wipe memory." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});