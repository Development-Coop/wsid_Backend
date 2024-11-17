const admin = require('firebase-admin');
const db = require('../db/init');
const bcrypt = require('bcryptjs');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../helper/jwt');
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
  const files = req.files;
  try {
    if (!files || files.length === 0) {
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
    let profilePicUrl = await uploadFileToFirebase('user', files[0]);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
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
      password: hashedPassword,
      createdAt: new Date(),
    });

    // Generate accessToken
    const accessToken = generateToken({
      uid: userRecord.uid,
      email: userRecord.email,
    });

    // Generate refreshToken
    const refreshToken = generateRefreshToken({
      uid: userRecord.uid,
      email: userRecord.email,
    });

    // Save the refresh token
    await db.collection('refresh_tokens').add({
      refreshToken,
      userId: userRecord.uid,
      createdAt: new Date(),
    });

    // Delete temporary user from `temp_users`
    await db.collection('temp_users').doc(tempUserSnapshot.docs[0].id).delete();

    return success(res, { accessToken, refreshToken }, messages.USER_REGISTERED);
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
    await sendOtpToEmail(email, otp);

    // Send success response
    return success(res, [], messages.OTP_SENT);
  } catch (err) {
    return error(res, messages.FAILED_OTP, [], 500);
  }
};

const generateUsernames = async (req, res) => {
  const { username } = req.body;
  console.log(username)
  try {
    // Check if the base username already exists
    const existingUser = await db.collection('users').where('username', '==', username).get();
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
      }
      suggestions.push(`${username}${randomNumber}`);
      suggestions.push(`${randomNumber}${username}`);
      suggestions.push(`${username}1`);
      suggestions.push(`${username}2`);
      suggestions.push(`${username}3`);

      // Check if any of the suggestions already exist in the database
      const checkedSuggestions = [];

      // Query Firestore to find any existing usernames in the suggestions list
      const snapshot = await db.collection('users').where('username', 'in', suggestions).get();
      const existingUsernames = snapshot.docs.map(doc => doc.data().username);

      // Filter out existing suggestions
      const availableSuggestions = suggestions.filter(suggestion => !existingUsernames.includes(suggestion));

      checkedSuggestions.push(...availableSuggestions);

      // Return a response indicating the username is already taken and suggest alternatives
      return success(res, { available: false, suggestions: checkedSuggestions.slice(0, 3) }, messages.USERNAME_EXIST);
    } else {
      // If the username doesn't exist, allow the user to proceed
      return success(res, { available: true }, messages.USERNAME_AVAILABLE);
    }
  } catch (err) {
    return error(res, messages.USERNAME_AVAILABILITY_ERROR, [], 500);
  }
};

const login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    let user;

    if (emailOrUsername.includes('@')) {
      // It's an email
      user = await admin.auth().getUserByEmail(emailOrUsername);
    } else {
      // It's a username, query Firestore to get the user by username
      const userSnapshot = await db.collection('users').where('username', '==', emailOrUsername).get();
      
      if (userSnapshot.empty) {
        return error(res, messages.INVALID_CREDENTIALS);
      }

      const userDoc = userSnapshot.docs[0];
      const userData = userDoc.data();
      
      // Fetch the user by their UID
      user = await admin.auth().getUser(userDoc.id);
    }

    // Check password (assuming you saved password hashes)
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();

    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return error(res, messages.INVALID_CREDENTIALS);
    }

    // Generate accessToken and refreshToken
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save the refresh token
    await db.collection('refresh_tokens').add({
      refreshToken,
      userId: user.uid,
      createdAt: new Date(),
    });

    return success(res, { accessToken, refreshToken }, messages.LOGIN_SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
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
    const { email } = req.body; // input can be either email or username

    const userRecord = await admin.auth().getUserByEmail(email);

    // Generate a new OTP and update the expiry time
    const { otp, otpExpires } = generateOTP();

    // Save OTP to Firestore (or any database) with an expiration time (e.g., 10 minutes)
    await db.collection('otp_verifications').doc(userRecord.uid).set({
      otp,
      email: userRecord.email,
      createdAt: new Date(),
      expiresAt: otpExpires
    });

    // Send OTP to the user's email using email service
    await sendOtpToEmail(email, otp);

    return success(res, [], messages.OTP_SENT);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const resetPassword = async (req, res) => {
  const { email, otp, password } = req.body;

  try {
    // Fetch OTP record from Firestore
    const otpSnapshot = await db.collection('otp_verifications').where('email', '==', email).get();
    if (otpSnapshot.empty) {
      return error(res, messages.INVALID_OTP_OR_EMAIL, [], 400);
    }

    const otpRecord = otpSnapshot.docs[0].data();

    // Validate if OTP has expired or OTP not matches
    const currentTime = new Date();
    const otpExpiresDate = new Date(otpRecord.expiresAt._seconds * 1000);
    if (String(otpRecord.otp) !== String(otp) || currentTime > otpExpiresDate) {
      return error(res, messages.INVALID_OTP_OR_EXPIRED, [], 400);
    }

    // Get the user by email and update the password in Firebase Authentication
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, {
      password,
    });

    // Optionally, update the hashed password in Firestore if you are storing user data there
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('users').doc(user.uid).update({
      password: hashedPassword,
    });

    // Delete OTP record after successful password reset
    await db.collection('otp_verifications').doc(otpSnapshot.docs[0].id).delete();

    return success(res, [], messages.PASSWORD_UPDATE_SUCCESS);
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

    // generate accessToken and refreshToken for backend session
    const accessToken = generateToken({uid, email});
    const refreshToken = generateRefreshToken({uid, email});

    // Save the refresh token
    await db.collection('refresh_tokens').add({
      refreshToken,
      userId: uid,
      createdAt: new Date(),
    });

    // Send success response
    return success(res, { accessToken, refreshToken }, messages.GOOGLE_SIGNIN_SUCCESS);
  } catch (err) {
    return error(res, messages.GOOGLE_SIGNIN_FAILED, [], 401);
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

    // generate accessToken and refreshToken for backend session
    const accessToken = generateToken({uid, email});
    const refreshToken = generateRefreshToken({uid, email});

    // Save the refresh token
    await db.collection('refresh_tokens').add({
      refreshToken,
      userId: uid,
      createdAt: new Date(),
    });

    // Send success response
    return success(res, { token }, messages.APPLE_SIGNIN_SUCCESS);
  } catch (err) {
    return error(res, messages.APPLE_SIGNIN_FAILED, [], 401);
  }
};

const refreshAccessToken = async (req, res) => {
  const { refreshToken } = req.body;
  try {
    // Verify the refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if the refresh token is in the database
    const tokenDoc = await db.collection('refresh_tokens').where('refreshToken', '==', refreshToken).get();

    if (tokenDoc.empty) {
      return error(res, messages.INVALID_REFRESH_TOKEN, [], 403);
    }

    // Generate a new access token
    const accessToken = generateToken({
      uid: decoded.uid,
      email: decoded.email
    });

    // Send the new access token
    return res.json({ accessToken });
  } catch (err) {
    // Handle expired refresh token case
    if (err.name === 'TokenExpiredError') {
      return error(res, messages.REFRESH_TOKEN_ERROR, [], 401);
      
    }

    return error(res, messages.EXPIRED_REFRESH_TOKEN, [], 403);
  }
};

module.exports = { 
  registerStep1,
  registerStep2,
  registerStep3,
  resendOtp,
  generateUsernames,
  login,
  logout,
  forgotPassword,
  resetPassword,
  googleSignIn,
  appleSignIn,
  refreshAccessToken
};
