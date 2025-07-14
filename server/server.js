const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/database");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
// Remove Google Cloud TTS import
// const textToSpeech = require("@google-cloud/text-to-speech");
const fs = require("fs");
const util = require("util");

// Import routes
const authRoutes = require("./routes/authRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const voiceCaptchaRoutes = require("./routes/voiceCaptchaRoutes");
const userRoutes = require("./routes/userRoutes");

dotenv.config(); // Load variables from .env

const app = express();
const PORT = 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(cors());
app.use("/audio", express.static("audio"));

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
debugger;
console.log("Check 1", process.env.GEMINI_API_KEY);

// Initialize ElevenLabs TTS (placeholder)
const elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
// You can use axios or fetch to call ElevenLabs API in your controllers as needed
// Example: axios.post('https://api.elevenlabs.io/v1/text-to-speech', ...)

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transaction", transactionRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/voice-captcha", voiceCaptchaRoutes);
app.use("/api/voice", require("./routes/voiceRoutes"));

// Legacy routes (for backward compatibility)
app.post("/api/signup", require("./controllers/authController").signup);
app.post("/api/login", require("./controllers/authController").login);

// Sample route
app.get("/", (req, res) => {
  res.send("Voice-Based CAPTCHA Banking System API");
});

// Start server
app.listen(PORT, "localhost", () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
