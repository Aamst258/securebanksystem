
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { generateQuestion, verifyResponse } = require('../controllers/voiceCaptchaController');

// Configure multer for audio uploads
const upload = multer({ dest: 'uploads/' });

// Generate personalized security question
router.post('/generate', generateQuestion);

// Verify voice response
router.post('/verify', upload.single('audio'), verifyResponse);

module.exports = router;
