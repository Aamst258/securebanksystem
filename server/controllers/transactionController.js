const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { verifyVoice } = require('./voiceBiometricController');

// Initiate transfer
const transferMoney = async (req, res) => {
  try {
    const { userId, recipient, amount } = req.body;

    // Find recipient by account number
    const recipientUser = await User.findOne({ accountNumber: recipient });
    if (!recipientUser) {
      return res.status(404).json({ success: false, message: 'Recipient account not found' });
    }

    const sender = await User.findById(userId);
    if (sender.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    // Create pending transaction
    const transaction = new Transaction({
      userId,
      type: 'transfer',
      amount,
      recipient: recipientUser._id,
      recipientAccountNumber: recipient,
      recipientName: recipientUser.name,
      status: 'pending'
    });

    await transaction.save();

    res.json({
      success: true,
      message: 'Transaction initiated. Voice verification required.',
      transactionId: transaction._id,
      recipientName: recipientUser.name
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Initiate deposit
const deposit = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const transaction = new Transaction({
      userId,
      type: 'deposit',
      amount,
      status: 'pending'
    });

    await transaction.save();

    res.json({
      success: true,
      message: 'Deposit initiated. Voice verification required.',
      transactionId: transaction._id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Initiate withdrawal
const withdraw = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    const user = await User.findById(userId);
    if (user.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    const transaction = new Transaction({
      userId,
      type: 'withdraw',
      amount,
      status: 'pending'
    });

    await transaction.save();

    res.json({
      success: true,
      message: 'Withdrawal initiated. Voice verification required.',
      transactionId: transaction._id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Complete transaction after voice verification
const completeTransaction = async (req, res) => {
  try {
    const { transactionId } = req.body;

    const transaction = await Transaction.findById(transactionId).populate('recipient');
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Transaction not approved' });
    }

    // Execute the transaction
    const user = await User.findById(transaction.userId);

    if (transaction.type === 'transfer') {
      const recipient = await User.findById(transaction.recipient);

      user.balance -= transaction.amount;
      recipient.balance += transaction.amount;

      await user.save();
      await recipient.save();

      transaction.status = 'completed';
      await transaction.save();

    } else if (transaction.type === 'deposit') {
      user.balance += transaction.amount;
      await user.save();

      transaction.status = 'completed';
      await transaction.save();

    } else if (transaction.type === 'withdraw') {
      user.balance -= transaction.amount;
      await user.save();

      transaction.status = 'completed';
      await transaction.save();
    }

    res.json({
      success: true,
      message: `${transaction.type} completed successfully`,
      newBalance: user.balance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user transactions
const getTransactions = async (req, res) => {
  try {
    const { userId } = req.params;

    const transactions = await Transaction.find({ userId })
      .populate('recipient', 'name accountNumber')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Find user by account number
const findUserByAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const user = await User.findOne({ accountNumber }).select('name accountNumber');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({
      success: true,
      user: {
        name: user.name,
        accountNumber: user.accountNumber
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  transferMoney,
  deposit,
  withdraw,
  completeTransaction,
  getTransactions,
  findUserByAccount
};