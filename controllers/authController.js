const admin = require('firebase-admin');
const db = require('../db/init');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../helper/jwt');
const { generateOTP } = require('../helper/util');
const sendOtpToEmail = require('../helper/node_mailer');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const registerStep1 = async (req, res) => {
  const { name, email, dateOfBirth } = req.body;
  try {
    // Check if the email already exists in the users collection
    const userSnapshot = await db.collection('users').where('email', '==', email).get();
    if (!userSnapshot.empty) {
      // If email exists, retrun error
      return error(res, messages.EMAIL_ALREADY_EXIST, [], 400);
    }

    // Check if the email already exists in the temp_users collection
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    let tempUserDocId = null;
    
    if (!tempUserSnapshot.empty) {
      // If email exists, get the document ID to update the record
      tempUserDocId = tempUserSnapshot.docs[0].id;
    }

    // Generate a new OTP and update the expiry time
    const { newOtp, otpExpires } = generateOTP();

    // If tempUserDocId is found, update the existing document, otherwise create a new one
    if (tempUserDocId) {
      await db.collection('temp_users').doc(tempUserDocId).update({
        name,
        email,
        dateOfBirth,
        otp,
        otpExpires,
        otpSentCount: 1,
        updatedAt: new Date(),
      });
    } else {
      await db.collection('temp_users').add({
        name,
        email,
        dateOfBirth,
        otp,
        otpExpires,
        otpSentCount: 1,
        createdAt: new Date(),
      });
    }

    // Send OTP to the user's email using email service
    await sendOtpToEmail(email, otp);

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

    // Validate if OTP has expired
    const currentTime = new Date();
    if (currentTime > tempUser.otpExpires) {
      return error(res, messages.OTP_EXPIRED, [], 400); // OTP expired error
    }

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
  const { email, password, username, bio } = req.body;
  const profilePic = req.file;
  try {
    if (!profilePic) {
      return error(res, messages.PROFILE_PICTURE_ERROR, [], 400);
    }

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

    // Check if the username is unique
    const userSnapshot = await db.collection('users').where('username', '==', username).get();
    if (!userSnapshot.empty) {
      return error(res, 'Username is already taken. Please choose another one.', [], 400);
    }

    // Handle the file upload here
    // Example: Save the file to disk (for demonstration purposes)
    /*
    const fs = require('fs');
    const path = require('path');
    const uploadPath = path.join(__dirname, '../uploads/', profilePic.originalname);
    fs.writeFileSync(uploadPath, profilePic.buffer);
    */

    // Or upload to cloud storage (e.g., AWS S3, Google Cloud Storage)
    // Use profilePic.buffer for the file data

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

const resendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the user exists in the temporary collection
    const userSnapshot = await db.collection('temp_users').where('email', '==', email).get();

    if (userSnapshot.empty) {
      return error(res, 'Email not found', [], 404);
    }

    // Get the temp user data (assuming only one result because emails should be unique)
    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    // Check if the user is already verified
    if (userData.otp_verified) {
      return error(res, 'Email already verified', [], 400);
    }

    // Optionally check if the OTP was recently sent and rate-limit the resend requests
    if (userData.otpSentCount >= process.env.MAX_ALLOWED_OTP_RESENDS) {
      return error(res, 'Max OTP resend attempts reached. Please try again later.', [], 429);
    }

    // Generate a new OTP and update the expiry time
    const { newOtp, otpExpires } = generateOTP();

    // Update the OTP in the database
    await db.collection('temp_users').doc(userDoc.id).update({
      otp: newOtp,
      otpExpires,
      otpSentCount: (userData.otpSentCount || 0) + 1, // Increment resend count
    });

    // Send OTP to the user's email using email service
    await sendOtpToEmail(email, otp);

    // Send success response
    return success(res, [], messages.OTP_SENT);
  } catch (err) {
    return error(res, 'Failed to resend OTP. Please try again later.', [], 500);
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
  resendOtp,
  login,
  googleSignIn,
  appleSignIn,
  logout,
  forgotPassword,
  resetPassword
};
