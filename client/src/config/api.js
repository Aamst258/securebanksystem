// src/config/api.js

const API_BASE_URL = "http://localhost:5000/api";

export const apiEndpoints = {
  // Auth endpoints
  signup: `${API_BASE_URL}/auth/signup`,
  login: `${API_BASE_URL}/auth/login`,

  // User endpoints
  getUserProfile: (userId) => `${API_BASE_URL}/users/${userId}`,
  updateUserProfile: (userId) => `${API_BASE_URL}/users/${userId}`,

  // Transactions
  transferMoney: `${API_BASE_URL}/transactions/transfer`,
  depositMoney: `${API_BASE_URL}/transactions/deposit`,
  withdrawMoney: `${API_BASE_URL}/transactions/withdraw`,
  transactionHistory: `${API_BASE_URL}/transactions/history`,

  // Voice APIs
  enrollVoice: `${API_BASE_URL}/voice/enroll`,
  verifyVoice: `${API_BASE_URL}/voice/verify`,

  // Voice Captcha APIs
  generateVoiceCaptcha: `${API_BASE_URL}/voice-captcha/generate`,
  verifyVoiceCaptcha: `${API_BASE_URL}/voice-captcha/verify`,
};

export { API_BASE_URL };
