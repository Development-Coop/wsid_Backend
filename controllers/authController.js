const admin = require('firebase-admin');
const db = require('../db/init');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../helper/jwt');
const sendOtpToEmail = require('../helper/node_mailer');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const registerStep1 = async (req, res) => {
  const { name, email, dateOfBirth } = req.body;
  try {
    // Check if the email already exists in the temp_users collection
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    let tempUserDocId = null;
    
    if (!tempUserSnapshot.empty) {
      // If email exists, get the document ID to update the record
      tempUserDocId = tempUserSnapshot.docs[0].id;
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // If tempUserDocId is found, update the existing document, otherwise create a new one
    if (tempUserDocId) {
      await db.collection('temp_users').doc(tempUserDocId).update({
        name,
        email,
        dateOfBirth,
        otp,
        updatedAt: new Date(),
      });
    } else {
      await db.collection('temp_users').add({
        name,
        email,
        dateOfBirth,
        otp,
        createdAt: new Date(),
      });
    }

    // Send OTP to the user's email using any email service (e.g., SendGrid, Nodemailer)
    //await sendOtpToEmail(email, otp);

    return success(res, [], messages.OTP_SENT);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const registerStep2 = async (req, res) => {
  const { email, otp } = req.body;
  try {
    // Fetch the temporary user from the database
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    
    if (tempUserSnapshot.empty) {
      return error(res, messages.EMAIL_NOT_FOUND, [], 404);
    }

    const tempUser = tempUserSnapshot.docs[0].data();
    
    // Check if the OTP is already verified
    /* if (tempUser.otpVerified) {
      return error(res, messages.EMAIL_ALREADY_VERIFIED, [], 400);
    } */

    // Check if the OTP matches
    if (String(tempUser.otp) !== String(otp)) {
      return error(res, messages.INVALID_OTP, [], 400);
    }

    // Mark the email as verified
    await db.collection('temp_users').doc(tempUserSnapshot.docs[0].id).update({ otpVerified: true });

    return success(res, [], messages.EMAIL_VERIFIED);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const registerStep3 = async (req, res) => {
  const { email, password, username, profilePic, bio } = req.body;
  try {
    // Fetch the temporary user
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    
    if (tempUserSnapshot.empty) {
      return error(res, messages.EMAIL_NOT_FOUND, [], 404);
    }

    const tempUser = tempUserSnapshot.docs[0].data();

    // Check if the email was verified
    if (!tempUser.otpVerified) {
      return error(res, messages.EMAIL_NOT_VERIFIED, [], 400);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password: hashedPassword,
      displayName: username,
    });

    // Save the user data to Firestore
    await db.collection('users').doc(userRecord.uid).set({
      name: tempUser.name,
      email: tempUser.email,
      dateOfBirth: tempUser.dateOfBirth,
      username,
      profilePic,
      bio,
      createdAt: new Date(),
    });

    // Delete temporary user from `temp_users`
    await db.collection('temp_users').doc(tempUserSnapshot.docs[0].id).delete();
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

module.exports = { 
  registerStep1,
  registerStep2,
  registerStep3,
  login,
  googleSignIn,
  appleSignIn,
  logout,
  forgotPassword,
  resetPassword
};
