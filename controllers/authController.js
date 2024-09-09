const admin = require('firebase-admin');
const db = require('../db/init');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../helper/jwt');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

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

    return success(res, [], messages.USER_REGISTERED);
  } catch (err) {
    return error(res, err.message, [], 500);
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
    if (!isMatch) {
      return error(res, messages.INVALID_CREDENTIALS);
    }

    // Generate JWT token
    const token = generateToken(user);

    return success(res, { token }, messages.LOGIN_SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

// Google Sign-In API (Backend)
const googleSignIn = async (req, res) => {
  const { idToken } = req.body; // Frontend will send the Google ID token
  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name } = decodedToken; // Extract user info from token

    // Check if user exists in Firestore, if not, create a new user record
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      // New user, save additional info in Firestore
      await db.collection('users').doc(uid).set({
        name,
        email,
        createdAt: new Date(),
      });
    }

    // Optionally generate JWT for your own backend session
    // const token = generateToken(uid); // If you use custom tokens

    // Send success response
    return success(res, { uid, email, name }, 'Google Sign-In successful');
  } catch (err) {
    return error(res, 'Invalid Google ID Token', [], 401);
  }
};

// Apple Sign-In API (Backend)
const appleSignIn = async (req, res) => {
  const { idToken } = req.body; // Frontend sends the Apple ID token
  try {
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name } = decodedToken; // Extract user info from token

    // Check if user exists in Firestore, if not, create a new user record
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      // New user, save additional info in Firestore
      await db.collection('users').doc(uid).set({
        name,
        email,
        createdAt: new Date(),
      });
    }

    // Optionally generate JWT for your own backend session
    // const token = generateToken(uid); // If you use custom tokens

    // Send success response
    return success(res, { uid, email, name }, 'Apple Sign-In successful');
  } catch (err) {
    return error(res, 'Invalid Apple ID Token', [], 401);
  }
};

const logout = async (req, res) => {
  try {
    // Invalidate token if needed (usually handled by the client)
    return success(res, [], messages.LOGOUT_SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    await admin.auth().generatePasswordResetLink(email);
    return success(res, [], messages.PASSWORD_RESET_EMAIL_SENT);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { oobCode, newPassword } = req.body; // oobCode is the password reset code from Firebase
    await admin.auth().confirmPasswordReset(oobCode, newPassword);
    return success(res, [], messages.PASSWORD_RESET_SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { register, login, googleSignIn, appleSignIn, logout, forgotPassword, resetPassword };
