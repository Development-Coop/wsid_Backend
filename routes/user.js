const express = require('express');
const {
  trendingUserList
} = require('../controllers/userController');
const validateRequest = require('../helper/validator');
const { 
    trendingSchema
  } = require('../model/request');
const router = express.Router();

router.get('/trending', validateRequest(trendingSchema), trendingUserList);

module.exports = router;