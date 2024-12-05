const express = require('express');
const { 
    createComment,
    updateComment,
    deleteComment,
    getAllComment,
    likeComment,
    dislikeComment,
    getLikesDislikesDetails
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
router.get('/get/:postId', authenticateJWT, getAllComment);
router.post('/like/:id', authenticateJWT, likeComment);
router.post('/dislike/:id', authenticateJWT, dislikeComment);
router.get('/:commentId/:type', authenticateJWT, getLikesDislikesDetails);

module.exports = router;