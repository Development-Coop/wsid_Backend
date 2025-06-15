const express = require('express');
const {
  usersList,
  trendingUserList,
  editProfile,
  viewProfile,
  likeProfile,
  followProfile,
  searchUsers,
  userDelete
} = require('../controllers/userController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.get('/list', authenticateJWT, usersList);
router.get('/trending', authenticateJWT, trendingUserList);
router.post('/edit', authenticateJWT, uploadValidator(), validateRequest(editProfileSchema), editProfile);
router.get('/view', authenticateJWT, viewProfile);
router.post('/like', authenticateJWT, likeProfile);
router.post('/follow', authenticateJWT, followProfile);
router.get('/search', authenticateJWT, searchUsers);
router.get('/self-delete', authenticateJWT, userDelete);


module.exports = router;