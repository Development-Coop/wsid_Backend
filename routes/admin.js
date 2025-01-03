const express = require('express');
const {
  login
} = require('../controllers/authController');
const {
    usersList,
    viewProfile,
    deleteUser
  } = require('../controllers/userController');
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

module.exports = router;