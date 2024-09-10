const admin = require('firebase-admin');
const db = require('../db/init');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../helper/jwt');
const { generateOTP } = require('../helper/util');
const { sendOtpToEmail } = require('../helper/node_mailer');
const { uploadFileToFirebase } = require('../helper/firebase_storage');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const registerStep1 = async (req, res) => {
  const { name, email, dateOfBirth } = req.body;
  try {
    // Check if the email already exists in the users collection
    const userSnapshot = await db.collection('users').where('email', '==', email).get();
    if (!userSnapshot.empty) {
      return error(res, messages.EMAIL_ALREADY_EXIST, [], 400);
    }

    // Check if the email already exists in the temp_users collection
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    let tempUserDocId = null;
    
    // If email exists, get the document ID to update the record
    if (!tempUserSnapshot.empty) {
      tempUserDocId = tempUserSnapshot.docs[0].id;
    }

    // Generate OTP and update the expiry time
    const { otp, otpExpires } = generateOTP();

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

    // Validate if OTP has expired
    const currentTime = new Date();
    const otpExpiresDate = new Date(tempUser.otpExpires._seconds * 1000);
    if (currentTime > otpExpiresDate) {
      return error(res, messages.OTP_EXPIRED, [], 400);
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
      return error(res, messages.USERNAME_EXIST, [], 400);
    }

    // Handle profile picture upload if a file is provided
    let profilePicUrl = null;
    if (profilePic) {
      profilePicUrl = await uploadFileToFirebase(profilePic);
    }

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
      profilePicUrl,
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
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();

    if (tempUserSnapshot.empty) {
      return error(res, messages.EMAIL_NOT_FOUND, [], 404);
    }

    // Get the temp user data (assuming only one result because emails should be unique)
    const tempUserDoc = tempUserSnapshot.docs[0];
    const tempUserData = tempUserDoc.data();

    // Check if the user is already verified
    if (tempUserData.otp_verified) {
      return error(res, EMAIL_ALREADY_VERIFIED, [], 400);
    }

    // Optionally check if the OTP was recently sent and rate-limit the resend requests
    if (tempUserData.otpSentCount >= process.env.MAX_ALLOWED_OTP_RESENDS) {
      return error(res, messages.MAX_OTP_REACHED, [], 429);
    }

    // Generate a new OTP and update the expiry time
    const { otp, otpExpires } = generateOTP();

    // Update the OTP in the database
    await db.collection('temp_users').doc(tempUserDoc.id).update({
      otp,
      otpExpires,
      otpSentCount: (tempUserData.otpSentCount || 0) + 1, // Increment resend count
    });

    // Send OTP to the user's email using email service
    //await sendOtpToEmail(email, otp);

    // Send success response
    return success(res, [], messages.OTP_SENT);
  } catch (err) {
    return error(res, 'Failed to resend OTP. Please try again later.', [], 500);
  }
};

const generateUsernames = async (req, res) => {
  const { username } = req.body;
  console.log(username)
  try {
    // Check if the base username already exists
    const existingUser = await db.collection('users').where('username', '==', username).get();
    console.log(existingUser)
    if (!existingUser.empty) {
      // If the username exists, generate suggestions
      let suggestions = [];
      
      // Split the username by the period (.)
      const usernameParts = username.split('.');

      // Generate a random number (100-999)
      const randomNumber = Math.floor(100 + Math.random() * 900); // Random number between 100 and 999

      if (usernameParts.length === 2) {
        const firstName = usernameParts[0];
        const lastName = usernameParts[1];

        // Suggest format 1: "Doe.Alex123"
        suggestions.push(`${lastName}.${firstName}${randomNumber}`);

        // Suggest format 2: "123DoeAlex"
        suggestions.push(`${randomNumber}${lastName}${firstName}`);
      } else {
        // If the username doesn't contain a period, generate simple random suggestions
        suggestions.push(`${username}${randomNumber}`);
        suggestions.push(`${randomNumber}${username}`);
      }

      // Return a response indicating the username is already taken and suggest alternatives
      return success(res, { available: false, suggestions }, messages.USERNAME_EXIST);
    } else {
      // If the username doesn't exist, allow the user to proceed
      return success(res, { available: true }, messages.USERNAME_AVAILABLE);
    }
  } catch (err) {
    return error(res, 'Error checking username availability', [], 500);
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
  generateUsernames,
  login,
  googleSignIn,
  appleSignIn,
  logout,
  forgotPassword,
  resetPassword
};
