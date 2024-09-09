const express = require('express');
const {
  registerStep1,
  registerStep2,
  registerStep3,
  login,
  googleSignIn,
  appleSignIn,
  logout,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const validateRequest = require('../helper/validator');
const { registerSchemaStep1, registerSchemaStep2, registerSchemaStep3 } = require('../model/request');
const router = express.Router();

router.post('/register-step1', validateRequest(registerSchemaStep1), registerStep1);
router.post('/register-step2', validateRequest(registerSchemaStep2), registerStep2);
router.post('/register-step3', validateRequest(registerSchemaStep3), registerStep3);

router.post('/login', login);
router.post('/login-with-google', googleSignIn);
router.post('/login-with-apple', appleSignIn);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
