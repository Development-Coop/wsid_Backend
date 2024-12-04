const express = require('express');
const {
    castVote,
    deleteVote
} = require('../controllers/voteController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const { 
  voteSchema
} = require('../model/request');
const router = express.Router();

router.post('/create', authenticateJWT, validateRequest(voteSchema), castVote);
router.delete('/delete', authenticateJWT, validateRequest(voteSchema), deleteVote);

module.exports = router;