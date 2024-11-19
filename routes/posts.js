const express = require('express');
const { 
    createPost,
    getAllPosts,
    getPostById,
    updatePost,
    deletePost,
    createOption,
    getOptionsByPostId,
    updateOption,
    deleteOption,
    castVote,
    deleteVote,
    createComment,
    likeComment,
    unlikeComment,
    getCommentsByPostId
} = require('./../controllers/postsController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.post('/post', authenticateJWT, uploadValidator(), createPost);
router.get('/post', authenticateJWT, getAllPosts);
router.get('/post/:id', authenticateJWT, getPostById);
router.put('/post/:id', authenticateJWT, uploadValidator(), updatePost);
router.delete('/post/:id', authenticateJWT, deletePost);

router.post('/option', authenticateJWT, uploadValidator(), createOption);
router.get('/option/:postId', authenticateJWT, getOptionsByPostId);
router.put('/option/:id', authenticateJWT, uploadValidator(), updateOption);
router.delete('/option/:id', authenticateJWT , deleteOption);

router.post('/vote/:postId/:optionId', authenticateJWT, castVote);
router.delete('/vote/:voteId/:optionId', authenticateJWT, deleteVote);

router.post('/comment', authenticateJWT, createComment);
router.post('/comment/like/:id', authenticateJWT, likeComment);
router.post('/comment/unlike/:id', authenticateJWT, unlikeComment);
router.get('/comment/:postId', authenticateJWT , getCommentsByPostId);

module.exports = router;