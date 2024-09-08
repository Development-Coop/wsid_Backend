const admin = require('firebase-admin');
const db = require('../db/init');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../helper/jwt');
const messages = require('../constants/messages');

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Create Firebase Authentication user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Store additional user data in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      name,
      email,
      createdAt: new Date(),
    });

    return res.status(201).json({ message: messages.USER_REGISTERED });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await admin.auth().getUserByEmail(email);

    // Check password (assuming you saved password hashes)
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();

    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch)
      return res.status(400).json({ message: messages.INVALID_CREDENTIALS });

    // Generate JWT token
    const token = generateToken(user);

    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    // Invalidate token if needed (this would be handled by client in most cases)
    return res.status(200).json({ message: messages.LOGOUT_SUCCESS });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    await admin.auth().generatePasswordResetLink(email);
    return res.json({ message: messages.PASSWORD_RESET_EMAIL_SENT });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { oobCode, newPassword } = req.body; // oobCode is the password reset code from Firebase
    await admin.auth().confirmPasswordReset(oobCode, newPassword);
    return res.json({ message: messages.PASSWORD_RESET_SUCCESS });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = { register, login, logout, forgotPassword, resetPassword };
