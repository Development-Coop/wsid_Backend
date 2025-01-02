const express = require('express');
const {
  login
} = require('../controllers/authController');
const {

} = require('../controllers/adminController');
const validateRequest = require('../helper/validator');
const {
    loginSchema
} = require('../model/request');
const router = express.Router();

router.post('/login', validateRequest(loginSchema), (req, res) => {
    login(req, res, true); // isAdmin = true
});

module.exports = router;