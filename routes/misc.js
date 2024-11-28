const express = require('express');
const { 
    subscribeUser
} = require('../controllers/miscController');
const validateRequest = require('../helper/validator');
const { 
    subscribeSchema
} = require('../model/request');
const router = express.Router();

router.post('/subscribe', validateRequest(subscribeSchema), subscribeUser);

module.exports = router;