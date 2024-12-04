const express = require('express');
const { 
    createComment,
    updateComment,
    deleteComment,
    likeComment,
    unlikeComment
} = require('../controllers/commentController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const { 
    createCommentSchema,
    editCommentSchema
} = require('../model/request');
const router = express.Router();

router.post('/create', authenticateJWT, validateRequest(createCommentSchema), createComment);
router.put('/update/:id', authenticateJWT, validateRequest(editCommentSchema), updateComment);
router.delete('/delete/:id', authenticateJWT, deleteComment);
router.post('/like/:id', authenticateJWT, likeComment);
router.post('/unlike/:id', authenticateJWT, unlikeComment);

module.exports = router;