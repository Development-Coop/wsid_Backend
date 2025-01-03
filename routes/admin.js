const express = require('express');
const {
  login
} = require('../controllers/authController');
const {
  usersList,
  viewProfile,
  deleteUser
} = require('../controllers/userController');
const {
  getAllPosts,
  getPostById,
  deletePost
} = require('../controllers/postController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const {
    loginSchema
} = require('../model/request');
const router = express.Router();

router.post('/login', validateRequest(loginSchema), (req, res) => {
    login(req, res, true); // isAdmin = true
});

router.get('/user/list', authenticateJWT, usersList);
router.get('/user/view', authenticateJWT, viewProfile);
router.delete('/user/delete', authenticateJWT, deleteUser);

router.get('/post', authenticateJWT, getAllPosts);
router.get('/post/:id', authenticateJWT, getPostById);
router.delete('/post/:id', authenticateJWT, deletePost);

module.exports = router;