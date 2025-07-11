// server/routes/authRoutes.js

const express = require('express');
const {
  signup,
  login,
  logout,
  forgotPassword,
} = require('../controllers/authController');

const router = express.Router();

// Auth routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);

module.exports = router;
