const express = require('express');
const { 
    createPost,
    getAllPosts,
    getPostById,
    updatePost,
    deletePost,
    searchPost,
    castVote,
    deleteVote,
    createComment,
    likeComment,
    unlikeComment
} = require('../controllers/postController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.post('/create', authenticateJWT, uploadValidator(), createPost);
router.put('/update/:id', authenticateJWT, uploadValidator(), updatePost);
router.delete('/delete/:id', authenticateJWT, deletePost);
router.get('/get', authenticateJWT, getAllPosts);
router.get('/get/:id', authenticateJWT, getPostById);
router.get('/search', authenticateJWT, searchPost);

/* need to implement
search api */

/* have to revise */
router.post('/vote/:postId/:optionId', authenticateJWT, castVote);
router.delete('/vote/:voteId/:optionId', authenticateJWT, deleteVote);

router.post('/comment', authenticateJWT, createComment);
router.post('/comment/like/:id', authenticateJWT, likeComment);
router.post('/comment/unlike/:id', authenticateJWT, unlikeComment);

/* need to implement instant delete:
delete post image
delete option
delete option image */

module.exports = router;