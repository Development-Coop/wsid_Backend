const express = require('express');
const {
  trendingUserList,
  editProfile
} = require('../controllers/userController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.get('/trending', authenticateJWT, trendingUserList);
router.post('/edit', authenticateJWT, uploadValidator, validateRequest(editProfileSchema), editProfile);

module.exports = router;