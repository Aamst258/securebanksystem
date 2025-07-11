
const express = require('express');
const { transferMoney, deposit, withdraw, completeTransaction, getTransactions, findUserByAccount } = require('../controllers/transactionController');

const router = express.Router();

router.post('/transfer', transferMoney);
router.post('/deposit', deposit);
router.post('/withdraw', withdraw);
router.post('/complete', completeTransaction);
router.get('/:userId', getTransactions);
router.get('/find/:accountNumber', findUserByAccount);

module.exports = router;
