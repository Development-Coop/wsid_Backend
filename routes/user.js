const express = require('express');
const {
  trendingUserList,
  editProfile,
  viewProfile,
  likeProfile,
  followProfile
} = require('../controllers/userController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.get('/trending', authenticateJWT, trendingUserList);
router.post('/edit', authenticateJWT, uploadValidator('profilePic'), validateRequest(editProfileSchema), editProfile);
router.get('/view', authenticateJWT, viewProfile);
router.post('/like', authenticateJWT, likeProfile);
router.post('/follow', authenticateJWT, followProfile);

module.exports = router;