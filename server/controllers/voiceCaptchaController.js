const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logVoiceVerification } = require("../middleware/voiceVerification");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();
const FormData = require("form-data");
const fs = require("fs");
const util = require("util");

// Retry logic for Gemini API
const retryWithBackoff = async (fn, retries = 3, delay = 1000) => {
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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ElevenLabs TTS helper
async function synthesizeWithElevenLabs(
  text,
  voice = "Rachel",
  outputPath = "audio/output.mp3"
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;
  const response = await axios.post(
    url,
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.5 },
    },
    {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );
  const writeFile = util.promisify(fs.writeFile);
  await writeFile(outputPath, response.data, "binary");
  return outputPath;
}

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

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const recentTransactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    const userContext = `User profile: Name: ${user.name}, Nickname: ${user.nickname}, Shoe Size: ${user.shoeSize}, Favorite Color: ${user.favoriteColor}, Birth Place: ${user.birthPlace}, Pet Name: ${user.petName}, Mother's Maiden Name: ${user.motherMaidenName}, First School: ${user.firstSchool}, Childhood Friend: ${user.childhoodFriend}. Recent transactions: ${recentTransactions.length} transactions in database.`;

    const prompt = `Based on this user context: ${userContext}. Generate a simple security question that only this specific user would know the answer to. The question should be about personal information like nickname, shoe size, favorite color, birth place, pet name, etc. Return only the question, nothing else. Make it conversational and friendly.`;

    let question;
    try {
      const result = await retryWithBackoff(() =>
        model.generateContent(prompt)
      );
      question = result.response.text().trim();
    } catch (err) {
      if (err.status === 429) {
        return res.status(429).json({
          success: false,
          message:
            "Gemini API quota exceeded. Please try again later or check your billing/quota settings.",
        });
      }
      console.error("Gemini AI error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to generate question from AI.",
      });
    }

    // Convert to speech using ElevenLabs TTS
    let audioFileName, audioPath;
    try {
      audioFileName = `question_${Date.now()}.mp3`;
      audioPath = `audio/${audioFileName}`;
      if (!fs.existsSync("audio")) {
        fs.mkdirSync("audio");
      }
      await synthesizeWithElevenLabs(question, "Rachel", audioPath);
    } catch (err) {
      console.error("TTS error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to synthesize question audio.",
      });
    }

    if (transactionId) {
      await Transaction.findByIdAndUpdate(transactionId, {
        $push: { verificationQuestions: question },
      });
    }

    res.json({
      success: true,
      question,
      audioUrl: `http://0.0.0.0:5000/audio/${audioFileName}`,
      language: user.language,
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
    let previousQuestions = [];
    if (transactionId) {
      transaction = await Transaction.findById(transactionId);
      if (transaction) {
        transaction.verificationAttempts =
          transaction.verificationAttempts || 0;
        transaction.verificationQuestions =
          transaction.verificationQuestions || [];
        previousQuestions = transaction.verificationQuestions;
        attemptsLeft = MAX_ATTEMPTS - (transaction.verificationAttempts || 0);
      }
    }

    const voiceResult = await verifyVoice(userId, audioFile.path);
    const spokenText = await convertSpeechToText(audioFile.path);
    const user = await User.findById(userId);
    const expectedAnswer = await getExpectedAnswer(user, transactionId);
    const textSimilarity = calculateSimilarity(
      spokenText.toLowerCase(),
      expectedAnswer.toLowerCase()
    );
    const isContentMatch = textSimilarity > 0.75;
    const overallSuccess =
      voiceResult.success && voiceResult.isMatch && isContentMatch;

    if (transaction) {
      transaction.verificationAttempts =
        (transaction.verificationAttempts || 0) + 1;
      attemptsLeft = MAX_ATTEMPTS - transaction.verificationAttempts;
      await transaction.save();
    }

    if (overallSuccess) {
      if (transaction) {
        transaction.status = "approved";
        await transaction.save();
      }
      return res.json({
        success: true,
        message: "Transaction approved",
        attemptsLeft,
        voiceMatch: voiceResult.isMatch,
        contentMatch: isContentMatch,
        voiceSimilarity: voiceResult.similarity,
        textSimilarity: textSimilarity,
      });
    } else if (attemptsLeft > 0) {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro-latest",
      });
      const recentTransactions = await Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5);
      const userContext = `User profile: Name: ${user.name}, Nickname: ${user.nickname}, Shoe Size: ${user.shoeSize}, Favorite Color: ${user.favoriteColor}, Birth Place: ${user.birthPlace}, Pet Name: ${user.petName}, Mother's Maiden Name: ${user.motherMaidenName}, First School: ${user.firstSchool}, Childhood Friend: ${user.childhoodFriend}. Recent transactions: ${recentTransactions.length} transactions in database.`;
      // Limit to last 5 previous questions to avoid prompt bloat
      const recentQuestions = previousQuestions.slice(-5);
      const avoidQuestions =
        recentQuestions.length > 0
          ? ` Avoid these questions: ${recentQuestions.join(" | ")}.`
          : "";
      const prompt = `Based on this user context: ${userContext}. Generate a different security question that only this specific user would know the answer to. The question should be about personal information like nickname, shoe size, favorite color, birth place, pet name, etc. Return only the question, nothing else. Make it conversational and friendly. Do not repeat previous questions.${avoidQuestions}`;
      let newQuestion;
      try {
        const result = await retryWithBackoff(() =>
          model.generateContent(prompt)
        );
        newQuestion = result.response.text().trim();
      } catch (err) {
        if (err.status === 429) {
          return res.status(429).json({
            success: false,
            message:
              "Gemini API quota exceeded. Please try again later or check your billing/quota settings.",
          });
        }
        console.error("Gemini AI error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to generate question from AI.",
        });
      }

      let retryAudioFileName, retryAudioPath;
      try {
        retryAudioFileName = `question_${Date.now()}.mp3`;
        retryAudioPath = `audio/${retryAudioFileName}`;
        if (!fs.existsSync("audio")) {
          fs.mkdirSync("audio");
        }
        await synthesizeWithElevenLabs(newQuestion, "Rachel", retryAudioPath);
      } catch (err) {
        console.error("TTS error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to synthesize question audio.",
        });
      }

      if (transaction) {
        transaction.verificationQuestions.push(newQuestion);
        await transaction.save();
      }

      return res.json({
        success: false,
        message: "Verification failed. Try again.",
        newQuestion,
        newAudioUrl: `http://0.0.0.0:5000/audio/${retryAudioFileName}`,
        attemptsLeft,
      });
    } else {
      if (transaction) {
        transaction.status = "denied";
        await transaction.save();
      }
      return res.json({
        success: false,
        message: "Maximum attempts reached. Transaction denied.",
        attemptsLeft: 0,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Convert speech to text using AssemblyAI
const convertSpeechToText = async (audioPath) => {
  try {
    const audioData = fs.readFileSync(audioPath);
    const uploadResponse = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      audioData,
      {
        headers: {
          Authorization: process.env.ASSEMBLYAI_API_KEY,
          "Content-Type": "application/octet-stream",
        },
      }
    );

    const transcriptResponse = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: uploadResponse.data.upload_url },
      {
        headers: {
          Authorization: process.env.ASSEMBLYAI_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const transcriptId = transcriptResponse.data.id;
    let transcript;

    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            Authorization: process.env.ASSEMBLYAI_API_KEY,
          },
        }
      );
      transcript = statusResponse.data;
    } while (
      transcript.status === "processing" ||
      transcript.status === "queued"
    );

    return transcript.text || "";
  } catch (error) {
    console.error("Speech-to-text error:", error);
    return "";
  }
};

const getExpectedAnswer = async (user, transactionId) => {
  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction || !transaction.verificationQuestions.length) {
      return "unknown";
    }

    const lastQuestion = transaction.verificationQuestions
      .slice(-1)[0]
      .toLowerCase();

    if (
      lastQuestion.includes("nickname") ||
      lastQuestion.includes("call you")
    ) {
      return user.nickname || "";
    }
    if (lastQuestion.includes("shoe") || lastQuestion.includes("size")) {
      return user.shoeSize || "";
    }
    if (lastQuestion.includes("color") || lastQuestion.includes("favourite")) {
      return user.favoriteColor || "";
    }
    if (lastQuestion.includes("pet") || lastQuestion.includes("animal")) {
      return user.petName || "";
    }
    if (lastQuestion.includes("mother") || lastQuestion.includes("maiden")) {
      return user.motherMaidenName || "";
    }
    if (
      lastQuestion.includes("school") ||
      lastQuestion.includes("first school")
    ) {
      return user.firstSchool || "";
    }
    if (lastQuestion.includes("friend") || lastQuestion.includes("childhood")) {
      return user.childhoodFriend || "";
    }
    if (lastQuestion.includes("born") || lastQuestion.includes("birth")) {
      return user.birthPlace || "";
    }

    return "unknown";
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
