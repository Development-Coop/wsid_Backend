const express = require('express');
const {
  register,
  login,
  googleSignIn,
  appleSignIn,
  logout,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const validateRequest = require('../helper/validator');
const { registerSchema } = require('../model/request');
const router = express.Router();

router.post('/register', validateRequest(registerSchema), register);
router.post('/login', login);
router.post('/login-with-google', googleSignIn);
router.post('/login-with-apple', appleSignIn);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
