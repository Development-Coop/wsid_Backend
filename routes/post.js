const express = require('express');
const { 
    createPost,
    getAllPosts,
    getPostById,
    updatePost,
    deletePost,
    searchPost,
    trendingPosts
} = require('../controllers/postController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  createPostSchema,
  searchPostSchema
} = require('../model/request');
const router = express.Router();

router.post('/create', authenticateJWT, uploadValidator(), validateRequest(createPostSchema), createPost);
router.put('/update/:id', authenticateJWT, uploadValidator(), updatePost);
router.delete('/delete/:id', authenticateJWT, deletePost);
router.get('/get', authenticateJWT, getAllPosts);
router.get('/get/:id', authenticateJWT, getPostById);
router.get('/search', authenticateJWT, validateRequest(searchPostSchema), searchPost);
router.get('/trending', authenticateJWT, trendingPosts);

module.exports = router;