const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { logVoiceVerification } = require("../middleware/voiceVerification");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();
const FormData = require("form-data");
const fs = require("fs");
const util = require("util");
const NodeCache = require("node-cache");
const questionCache = new NodeCache({ stdTTL: 120 }); // 2 minutes TTL

// Retry logic for Gemini API
const retryWithBackoff = async (fn, retries = 2, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && i < retries - 1) {
        console.warn(`Rate limit hit. Retrying in ${delay * (i + 1)}ms...`);
        await new Promise((res) => setTimeout(res, delay * (i + 1)));
      } else {
        throw err;
      }
    }
  }
};

// Remove ElevenLabs TTS helper and AssemblyAI STT logic
// Add helpers to call local Python service for TTS and STT
// Helper to call Python TTS (Coqui)
async function synthesizeWithCoqui(text, outputPath = "audio/output.mp3") {
  const response = await axios.post(
    "http://0.0.0.0:5001/tts",
    { text },
    { responseType: "arraybuffer" }
  );
  const writeFile = util.promisify(fs.writeFile);
  await writeFile(outputPath, response.data, "binary");
  return outputPath;
}

// Helper to call Python STT (Vosk)
async function convertSpeechToText(audioPath) {
  const formData = new FormData();
  formData.append("audio", fs.createReadStream(audioPath));
  const response = await axios.post("http://0.0.0.0:5001/stt", formData, {
    headers: formData.getHeaders(),
  });
  return response.data.text || "";
}

// Map of profile fields to question templates
const QUESTION_TEMPLATES = [
  { field: "nickname", question: "What is your nickname?" },
  { field: "shoeSize", question: "What is your shoe size?" },
  { field: "favoriteColor", question: "What is your favorite color?" },
  { field: "birthPlace", question: "What is your birth place?" },
  { field: "petName", question: "What is your pet's name?" },
  { field: "motherMaidenName", question: "What is your mother's maiden name?" },
  { field: "firstSchool", question: "What is the name of your first school?" },
  { field: "childhoodFriend", question: "Who was your best childhood friend?" },
];

const generateQuestion = async (req, res) => {
  try {
    const { userId, transactionId } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required field: userId" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    // Find all fields that are filled in
    const filledFields = QUESTION_TEMPLATES.filter((q) => user[q.field]);
    if (filledFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No security info available for this user.",
      });
    }
    // Pick a random field
    const selected =
      filledFields[Math.floor(Math.random() * filledFields.length)];
    const question = selected.question;
    // Synthesize question audio
    let audioFileName, audioPath;
    try {
      audioFileName = `question_${Date.now()}.mp3`;
      audioPath = `audio/${audioFileName}`;
      if (!fs.existsSync("audio")) {
        fs.mkdirSync("audio");
      }
      await synthesizeWithCoqui(question, audioPath);
    } catch (err) {
      console.error("TTS error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to synthesize question audio.",
      });
    }
    // Store the question/field in the transaction for later verification
    if (transactionId) {
      await Transaction.findByIdAndUpdate(transactionId, {
        $push: { verificationQuestions: question },
        $set: { lastVerificationField: selected.field },
      });
    }
    res.json({
      success: true,
      question,
      audioUrl: `http://localhost:5000/audio/${audioFileName}`,
      language: user.language,
      field: selected.field,
    });
  } catch (error) {
    console.error("VoiceCaptcha generateQuestion error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const { verifyVoice } = require("./voiceBiometricController");

const MAX_ATTEMPTS = 3;

const verifyResponse = async (req, res) => {
  try {
    const { userId, transactionId } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      return res
        .status(400)
        .json({ success: false, message: "Audio response required" });
    }

    let transaction = null;
    let attemptsLeft = MAX_ATTEMPTS;
    let verificationField = null;
    if (transactionId) {
      transaction = await Transaction.findById(transactionId);
      if (transaction) {
        transaction.verificationAttempts =
          transaction.verificationAttempts || 0;
        transaction.verificationQuestions =
          transaction.verificationQuestions || [];
        attemptsLeft = MAX_ATTEMPTS - (transaction.verificationAttempts || 0);
        verificationField = transaction.lastVerificationField;
      }
    }

    const voiceResult = await verifyVoice(userId, audioFile.path);
    const spokenText = await convertSpeechToText(audioFile.path);
    const user = await User.findById(userId);
    // Use the stored field for answer checking
    let expectedAnswer = "";
    if (verificationField && user[verificationField]) {
      expectedAnswer = user[verificationField].toString();
    }
    const textSimilarity = calculateSimilarity(
      spokenText.trim().toLowerCase(),
      expectedAnswer.trim().toLowerCase()
    );
    const isContentMatch = textSimilarity > 0.50;
    const overallSuccess =
      voiceResult.success && voiceResult.isMatch && isContentMatch;

    if (transaction) {
      transaction.verificationAttempts =
        (transaction.verificationAttempts || 0) + 1;
      await transaction.save();
      attemptsLeft = MAX_ATTEMPTS - transaction.verificationAttempts;
    }

    if (overallSuccess) {
      if (transaction) {
        transaction.status = "approved";
        await transaction.save();
      }
      
      // Console logging for successful verification
      console.log("✅ VOICE VERIFICATION SUCCESS:");
      console.log(`- User ID: ${userId}`);
      console.log(`- Transaction ID: ${transactionId}`);
      console.log(`- Voice Match: ${voiceResult.isMatch}`);
      console.log(`- Content Match: ${isContentMatch}`);
      console.log(`- Voice Similarity: ${voiceResult.similarity}`);
      console.log(`- Text Similarity: ${textSimilarity}`);
      console.log(`- Expected Answer: "${expectedAnswer}"`);
      console.log(`- User Said: "${spokenText}"`);
      console.log("📝 TRANSACTION VERIFIED AND APPROVED");
      
      return res.json({
        success: true,
        message: "Transaction approved",
        attemptsLeft,
        voiceMatch: voiceResult.isMatch,
        contentMatch: isContentMatch,
        // Fix: Send correct field names that frontend expects
        similarity: voiceResult.similarity, // Frontend expects 'similarity' not 'voiceSimilarity'
        recognizedText: spokenText, // Frontend expects 'recognizedText'
        textSimilarity: textSimilarity,
      });
    } else if (attemptsLeft > 0) {
      // Console logging for failed attempt
      console.log("❌ VOICE VERIFICATION FAILED:");
      console.log(`- User ID: ${userId}`);
      console.log(`- Transaction ID: ${transactionId}`);
      console.log(`- Voice Match: ${voiceResult.isMatch}`);
      console.log(`- Content Match: ${isContentMatch}`);
      console.log(`- Voice Similarity: ${voiceResult.similarity}`);
      console.log(`- Text Similarity: ${textSimilarity}`);
      console.log(`- Expected Answer: "${expectedAnswer}"`);
      console.log(`- User Said: "${spokenText}"`);
      console.log(`- Attempts Left: ${attemptsLeft}`);
      
      // The user will be prompted to try again with the same question.
      return res.json({
        success: false,
        message: "Verification failed. Try again.",
        attemptsLeft,
        // Send diagnostic data even on failure
        similarity: voiceResult.similarity,
        recognizedText: spokenText,
      });
    } else {
      if (transaction) {
        transaction.status = "denied";
        await transaction.save();
      }
      
      console.log("🚫 MAXIMUM ATTEMPTS REACHED:");
      console.log(`- User ID: ${userId}`);
      console.log(`- Transaction ID: ${transactionId}`);
      console.log("- Transaction DENIED");
      
      return res.json({
        success: false,
        message: "Maximum attempts reached. Transaction denied.",
        attemptsLeft: 0,
        similarity: voiceResult.similarity,
        recognizedText: spokenText,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update getExpectedAnswer to use the stored field
const getExpectedAnswer = async (user, transactionId) => {
  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction || !transaction.lastVerificationField) {
      return "unknown";
    }
    return user[transaction.lastVerificationField] || "unknown";
  } catch (error) {
    console.error("Error getting expected answer:", error);
    return "unknown";
  }
};

// String similarity comparison
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

module.exports = { generateQuestion, verifyResponse };
