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
  console.log('=== RegisterStep1 Started ===');
  const { name, email, dateOfBirth } = req.body;
  console.log('Request data:', { name, email, dateOfBirth });
  
  // Check environment variables
  console.log('Environment check:');
  console.log('- SENDGRID_API_KEY exists:', !!process.env.SENDGRID_API_KEY);
  console.log('- FROM_EMAIL:', process.env.FROM_EMAIL);
  console.log('- OTP_EXPIRATION_TIME:', process.env.OTP_EXPIRATION_TIME);
  
  try {
    console.log('Step 1: Checking if email exists in users collection...');
    // Check if the email already exists in the users collection
    const userSnapshot = await db.collection('users').where('email', '==', email).get();
    console.log('Users collection check - Email exists:', !userSnapshot.empty);
    
    if (!userSnapshot.empty) {
      console.log('Email already exists in users collection - returning error');
      return error(res, messages.EMAIL_ALREADY_EXIST, [], 400);
    }

    console.log('Step 2: Checking if email exists in temp_users collection...');
    // Check if the email already exists in the temp_users collection
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    let tempUserDocId = null;
    console.log('Temp users collection check - Email exists:', !tempUserSnapshot.empty);
    
    // If email exists, get the document ID to update the record
    if (!tempUserSnapshot.empty) {
      tempUserDocId = tempUserSnapshot.docs[0].id;
      console.log('Found existing temp user with ID:', tempUserDocId);
    }

    console.log('Step 3: Generating OTP...');
    // Generate OTP and update the expiry time
    const { otp, otpExpires } = generateOTP();
    console.log('OTP generated:', otp);
    console.log('OTP expires at:', otpExpires);

    console.log('Step 4: Saving to temp_users collection...');
    // If tempUserDocId is found, update the existing document, otherwise create a new one
    if (tempUserDocId) {
      console.log('Updating existing temp user document...');
      await db.collection('temp_users').doc(tempUserDocId).update({
        name,
        email,
        dateOfBirth,
        otp,
        otpExpires,
        otpSentCount: 1,
        updatedAt: new Date(),
      });
      console.log('Successfully updated existing temp user');
    } else {
      console.log('Creating new temp user document...');
      const docRef = await db.collection('temp_users').add({
        name,
        email,
        dateOfBirth,
        otp,
        otpExpires,
        otpSentCount: 1,
        createdAt: new Date(),
      });
      console.log('Successfully created new temp user with ID:', docRef.id);
    }

    console.log('Step 5: About to send OTP email...');
    console.log('Sending OTP to:', email);
    console.log('OTP to send:', otp);
    
    // Send OTP to the user's email using email service
    await sendOtpToEmail(email, otp);
    console.log('OTP email sent successfully!');

    console.log('Step 6: Sending success response...');
    return success(res, [], messages.OTP_SENT);
    
  } catch (err) {
    console.error('=== RegisterStep1 Error ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    // Check if it's a SendGrid specific error
    if (err.response) {
      console.error('SendGrid response error:');
      console.error('- Status:', err.response.status);
      console.error('- Body:', err.response.body);
    }
    
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
  console.log('=== RegisterStep3 Started ===');
  console.log('Request body:', req.body);
  console.log('Request files:', req.files);
  
  const { email, password, username, bio } = req.body;
  const files = req.files;
  
  try {
    // Find the profile picture file (optional)
    const profilePic = files?.find(file => file.fieldname === 'profilePic') || files?.[0];
    console.log('Profile picture file:', profilePic ? 'Found' : 'Not found');
    
    // Check if required fields are present (only email, password, username are required)
    if (!email || !password || !username) {
      console.log('Missing required fields:', { email: !!email, password: !!password, username: !!username });
      return error(res, 'Missing required fields: email, password, and username are required', [], 400);
    }

    console.log('Fetching temporary user...');
    // Fetch the temporary user
    const tempUserSnapshot = await db.collection('temp_users').where('email', '==', email).get();
    if (tempUserSnapshot.empty) {
      console.log('Temp user not found for email:', email);
      return error(res, messages.EMAIL_NOT_FOUND, [], 404);
    }

    const tempUser = tempUserSnapshot.docs[0].data();
    console.log('Temp user found, otpVerified:', tempUser.otpVerified);

    // Check if the email was verified
    if (!tempUser.otpVerified) {
      console.log('Email not verified');
      return error(res, messages.EMAIL_NOT_VERIFIED, [], 400);
    }

    console.log('Checking username uniqueness...');
    // Check if the username is unique
    const userSnapshot = await db.collection('users').where('username', '==', username).get();
    if (!userSnapshot.empty) {
      console.log('Username already exists:', username);
      return error(res, messages.USERNAME_EXIST, [], 400);
    }

    // Handle profile picture upload (OPTIONAL)
    let profilePicUrl = null;
    if (profilePic) {
      console.log('Uploading profile picture to Firebase...');
      try {
        profilePicUrl = await uploadFileToFirebase('profile', profilePic);
        console.log('Profile picture uploaded successfully:', profilePicUrl);
      } catch (uploadError) {
        console.error('Profile picture upload failed:', uploadError);
        // Don't return error for optional profile picture - just log and continue
        console.log('Continuing registration without profile picture');
        profilePicUrl = null;
      }
    } else {
      console.log('No profile picture provided - continuing without profile picture');
    }

    console.log('Hashing password...');
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Creating Firebase Auth user...');
    // Create the user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: username,
    });
    console.log('Firebase Auth user created:', userRecord.uid);

    console.log('Saving user data to Firestore...');
    // Save the user data to Firestore
    await db.collection('users').doc(userRecord.uid).set({
      name: tempUser.name,
      email: tempUser.email,
      dateOfBirth: tempUser.dateOfBirth,
      username,
      profilePicUrl: profilePicUrl || null, // Optional profile picture
      bio: bio || '', // Optional bio (empty string if not provided)
      password: hashedPassword,
      status: true,
      role: 'user',
      createdAt: new Date(),
    });

    console.log('Generating tokens...');
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

    console.log('Saving refresh token...');
    // Save the refresh token
    await db.collection('refresh_tokens').add({
      refreshToken,
      userId: userRecord.uid,
      createdAt: new Date(),
    });

    console.log('Deleting temp user...');
    // Delete temporary user from `temp_users`
    await db.collection('temp_users').doc(tempUserSnapshot.docs[0].id).delete();

    console.log('Registration completed successfully');
    return success(res, { 
      accessToken, 
      refreshToken,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        username: username,
        name: tempUser.name,
        profilePicUrl: profilePicUrl,
        bio: bio || ''
      }
    }, messages.USER_REGISTERED);
  } catch (err) {
    console.error('=== RegisterStep3 Error ===');
    console.error('Error:', err);
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

const login = async (req, res, isAdmin = false) => {
  console.log('Login function started');
  try {
    const { emailOrUsername, password } = req.body;
    console.log('Processing login for:', emailOrUsername);
    
    let user;

    if (emailOrUsername.includes('@')) {
      user = await admin.auth().getUserByEmail(emailOrUsername);
      console.log('User found by email:', user.uid);
    } else {
      const userSnapshot = await db.collection('users').where('username', '==', emailOrUsername).get();
      
      if (userSnapshot.empty) {
        console.log('No user found with username:', emailOrUsername);
        return error(res, messages.INVALID_CREDENTIALS);
      }

      const userDoc = userSnapshot.docs[0];
      user = await admin.auth().getUser(userDoc.id);
      console.log('User found by username:', user.uid);
    }
    
    // Check password (assuming you saved password hashes)
    console.log('Fetching user document from Firestore...');
    const userDoc = await db.collection('users').doc(user.uid).get();
    console.log('Firestore document exists:', userDoc.exists);
    
    if (!userDoc.exists) {
      console.log('No Firestore document found for user:', user.uid);
      return error(res, messages.INVALID_CREDENTIALS);
    }
    
    const userData = userDoc.data();
    console.log('User data from Firestore:', userData);

    if (!userData || userData.status !== true) {
      console.log('User inactive or missing status. Status:', userData?.status);
      return error(res, messages.INVALID_CREDENTIALS);
    }

    // Check if the login type matches the user's role
    if (isAdmin && userData.role !== 'admin') {
      console.log('Admin access denied for non-admin user');
      return error(res, messages.UNAUTHORISED_ACCESS);
    }

    // Check if user has a password
    if (!userData.password) {
      console.log('No password found in Firestore document');
      return error(res, 'Account has no password set', [], 400);
    }

    console.log('Comparing passwords...');
    const isMatch = await bcrypt.compare(password, userData.password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      console.log('Password mismatch');
      return error(res, messages.INVALID_CREDENTIALS);
    }

    console.log('Generating tokens...');
    // Generate accessToken and refreshToken
    const accessToken = generateToken({
      uid: user.uid,
      email: user.email,
      role: userData.role,
    });
    const refreshToken = generateRefreshToken(user);

    console.log('Saving refresh token...');
    // Save the refresh token
    await db.collection('refresh_tokens').add({
      refreshToken,
      userId: user.uid,
      createdAt: new Date(),
    });

    console.log('Login successful');
    return success(res, { accessToken, refreshToken }, messages.LOGIN_SUCCESS);
  } catch (err) {
    console.error('Login error:', err);
    return error(res, err.message, [], 500);
  }
};

const logout = async (req, res) => {
  const { refreshToken } = req.body;
  const { uid } = req.user;
  try {
    // Verify the refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.uid !== uid) {
      return error(res, messages.INVALID_REFRESH_TOKEN, [], 400);
    }

    // Check if the refresh token exists in the database
    const tokenQuery = await db.collection('refresh_tokens')
      .where('refreshToken', '==', refreshToken)
      .where('userId', '==', uid)
      .get();
    if (tokenQuery.empty) {
      return error(res, messages.INVALID_REFRESH_TOKEN, [], 403);
    }

    // Delete the refresh token from the database
    const batch = db.batch();
    tokenQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

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
        status: true,
        role: 'user',
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
        status: true,
        role: 'user',
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
