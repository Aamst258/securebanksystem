
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const textToSpeech = require("@google-cloud/text-to-speech");
const { logVoiceVerification } = require('../middleware/voiceVerification');
const axios = require('axios');
const FormData = require('form-data');
const fs = require("fs");
const util = require("util");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ttsClient = new textToSpeech.TextToSpeechClient({
  keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
});

const generateQuestion = async (req, res) => {
  try {
    const { userId, transactionId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate personalized question using Gemini AI
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Get recent transactions for context
    const recentTransactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    const userContext = `User profile: Name: ${user.name}, Nickname: ${user.nickname}, Shoe Size: ${user.shoeSize}, Favorite Color: ${user.favoriteColor}, Birth Place: ${user.birthPlace}, Pet Name: ${user.petName}, Mother's Maiden Name: ${user.motherMaidenName}, First School: ${user.firstSchool}, Childhood Friend: ${user.childhoodFriend}. Recent transactions: ${recentTransactions.length} transactions in database.`;

    const prompt = `Based on this user context: ${userContext}. Generate a simple security question that only this specific user would know the answer to. The question should be about personal information like nickname, shoe size, favorite color, birth place, pet name, etc. Return only the question, nothing else. Make it conversational and friendly.`;

    const result = await model.generateContent(prompt);
    const question = result.response.text().trim();

    // Convert to speech using Google Cloud TTS
    const request = {
      input: { text: question },
      voice: {
        languageCode: user.language === 'hi' ? 'hi-IN' : user.language === 'es' ? 'es-ES' : user.language === 'fr' ? 'fr-FR' : 'en-US',
        ssmlGender: 'NEUTRAL'
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioFileName = `question_${Date.now()}.mp3`;
    const audioPath = `audio/${audioFileName}`;

    // Ensure audio directory exists
    if (!fs.existsSync('audio')) {
      fs.mkdirSync('audio');
    }

    const writeFile = util.promisify(fs.writeFile);
    await writeFile(audioPath, response.audioContent, 'binary');

    // Update transaction with the question
    if (transactionId) {
      await Transaction.findByIdAndUpdate(transactionId, {
        $push: { verificationQuestions: question }
      });
    }

    res.json({
      success: true,
      question,
      audioUrl: `http://0.0.0.0:5000/audio/${audioFileName}`,
      language: user.language
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const { verifyVoice } = require('./voiceBiometricController');

const verifyResponse = async (req, res) => {
  try {
    const { userId, transactionId } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ success: false, message: 'Audio response required' });
    }

    // Step 1: Voice biometric verification
    const voiceResult = await verifyVoice(userId, audioFile.path);
    
    if (!voiceResult.success || !voiceResult.isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Voice verification failed - unauthorized user detected',
        voiceMatch: false
      });
    }

    // Step 2: Convert speech to text and verify content
    // In production, use Google Speech-to-Text or Azure Speech Services
    const spokenText = await convertSpeechToText(audioFile.path);
    const user = await User.findById(userId);
    const expectedAnswer = await getExpectedAnswer(user, transactionId);
    
    const textSimilarity = calculateSimilarity(spokenText.toLowerCase(), expectedAnswer.toLowerCase());
    const isContentMatch = textSimilarity > 0.75;

    // Both voice biometric AND content must match
    const overallSuccess = voiceResult.isMatch && isContentMatch;

    // Update transaction status
    if (transactionId) {
      await Transaction.findByIdAndUpdate(transactionId, {
        status: overallSuccess ? 'approved' : 'denied',
        verificationResult: {
          voiceMatch: voiceResult.isMatch,
          contentMatch: isContentMatch,
          voiceSimilarity: voiceResult.similarity,
          textSimilarity: textSimilarity
        }
      });
    }

    res.json({
      success: overallSuccess,
      message: overallSuccess ? 'Transaction approved' : 'Verification failed',
      voiceMatch: voiceResult.isMatch,
      contentMatch: isContentMatch,
      voiceSimilarity: voiceResult.similarity,
      textSimilarity: textSimilarity
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Convert speech to text using AssemblyAI
const convertSpeechToText = async (audioPath) => {
  try {
    const fs = require('fs');
    const axios = require('axios');
    
    // Upload audio file to AssemblyAI
    const audioData = fs.readFileSync(audioPath);
    const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioData, {
      headers: {
        'Authorization': process.env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream'
      }
    });
    
    // Request transcription
    const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: uploadResponse.data.upload_url
    }, {
      headers: {
        'Authorization': process.env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    // Poll for completion
    const transcriptId = transcriptResponse.data.id;
    let transcript;
    
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY
        }
      });
      transcript = statusResponse.data;
    } while (transcript.status === 'processing' || transcript.status === 'queued');
    
    return transcript.text || '';
  } catch (error) {
    console.error('Speech-to-text error:', error);
    return '';
  }
};

const getExpectedAnswer = async (user, transactionId) => {
  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction || !transaction.verificationQuestions.length) {
      return "unknown";
    }
    
    const lastQuestion = transaction.verificationQuestions.slice(-1)[0].toLowerCase();
    
    // Enhanced question matching
    if (lastQuestion.includes('nickname') || lastQuestion.includes('call you')) {
      return user.nickname || '';
    }
    if (lastQuestion.includes('shoe') || lastQuestion.includes('size')) {
      return user.shoeSize || '';
    }
    if (lastQuestion.includes('color') || lastQuestion.includes('favourite')) {
      return user.favoriteColor || '';
    }
    if (lastQuestion.includes('pet') || lastQuestion.includes('animal')) {
      return user.petName || '';
    }
    if (lastQuestion.includes('mother') || lastQuestion.includes('maiden')) {
      return user.motherMaidenName || '';
    }
    if (lastQuestion.includes('school') || lastQuestion.includes('first school')) {
      return user.firstSchool || '';
    }
    if (lastQuestion.includes('friend') || lastQuestion.includes('childhood')) {
      return user.childhoodFriend || '';
    }
    if (lastQuestion.includes('born') || lastQuestion.includes('birth')) {
      return user.birthPlace || '';
    }
    
    return "unknown";
  } catch (error) {
    console.error('Error getting expected answer:', error);
    return "unknown";
  }
};

// Simple similarity calculation
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
