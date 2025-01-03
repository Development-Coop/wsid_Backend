const express = require('express');
const {
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
  resetPassword,
  refreshAccessToken
} = require('../controllers/authController');
const { authenticateJWT } = require('../helper/jwt');
const validateRequest = require('../helper/validator');
const uploadValidator = require('../helper/multer');
const { 
  registerSchemaStep1,
  registerSchemaStep2,
  registerSchemaStep3,
  resendOtpSchema,
  userNameSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshAccessTokenSchema
} = require('../model/request');
const router = express.Router();

router.post('/register-step1', validateRequest(registerSchemaStep1), registerStep1);
router.post('/register-step2', validateRequest(registerSchemaStep2), registerStep2);
router.post('/register-step3', uploadValidator(), validateRequest(registerSchemaStep3), registerStep3);
router.post('/resend-otp', validateRequest(resendOtpSchema), resendOtp);
router.post('/username-suggestions', validateRequest(userNameSchema), generateUsernames);
router.post('/login', validateRequest(loginSchema), (req, res) => {
  login(req, res, false); // isAdmin = false
});
router.post('/logout', validateRequest(refreshAccessTokenSchema), authenticateJWT, logout);
router.post('/forgot-password', validateRequest(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), resetPassword);
router.post('/login-with-google', googleSignIn);
router.post('/login-with-apple', appleSignIn);
router.post('/refresh-token', validateRequest(refreshAccessTokenSchema), refreshAccessToken);

module.exports = router;
