import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose"; // 👈 1. Import Mongoose

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

//2. Connect to the MongoDB Vault
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("⚓ Connected to MongoDB Vault!"))
  .catch((err) => console.error("🔥 MongoDB Connection Error:", err));

//3. Define the blueprint for our Database (Schema)
const chatSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  history: { type: Array, default: [] } // Stores the exact Gemini chat format
});

const ChatSession = mongoose.model("ChatSession", chatSchema);

// Configure Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", // Using the latest standard model
    systemInstruction: "Your name is NeoAI. You are a highly intelligent, friendly, and slightly sarcastic ocean-themed assistant."
});

//4. The Upgraded Chat Route
app.post("/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ reply: "Hold up! You need a session ID." });
        }

        console.log(`🌊 Received from [${sessionId.substring(0,6)}...]:`, message);

        // A. Look up the user's history in the database
        let userRecord = await ChatSession.findOne({ sessionId });
        
        // B. If they don't exist yet, create a new blank log for them
        if (!userRecord) {
            userRecord = new ChatSession({ sessionId, history: [] });
        }

        // C. Load that history into a fresh Gemini chat instance
        const userChat = model.startChat({ 
            history: userRecord.history 
        });

        // D. Send the new message to Gemini
        const result = await userChat.sendMessage(message);
        const botReply = result.response.text();

        // E. Save the updated history (including this new message) back to MongoDB!
        userRecord.history = await userChat.getHistory();
        await userRecord.save();
        
        res.json({ reply: botReply });
    } 
    
    catch (error) {
        console.error("BACKEND ERROR:", error); 
        
        // If google is just busy,tell the user politely
        if (error.status === 503) {
            return res.status(503).json({ reply: "The ocean currents are a bit too rough right now! My AI servers are currently busy. Give me a few seconds and try again." });
        }

        if (error.status === 429) {
            return res.status(429).json({ reply: "Whoa there, Captain! We hit a speed limit. Google's free tier only allows a few messages per minute. Wait about 30 seconds and try again!" });
        }

        //For any other errors:
        res.status(500).json({ reply: "Oops! Something went wrong in the kelp forest."});
    }
});

//5. The Upgraded Reset Route
app.post("/reset", async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (sessionId) {
            // Delete the user's record entirely from the database
            await ChatSession.deleteOne({ sessionId });
            console.log(`🧹 Wiped database memory for user: ${sessionId.substring(0,6)}...`);
        }
        
        res.json({ message: "Memory wiped!" });
    } catch (error) {
        console.error("🔥 RESET ERROR:", error);
        res.status(500).json({ error: "Failed to wipe memory." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});