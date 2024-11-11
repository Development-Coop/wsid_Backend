const express = require('express');
const { 
    createPost,
    getPosts,
    getPostById,
    updatePost,
    deletePost 
} = require('./postController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.post('/posts', authenticateJWT, uploadValidator, createPost);
router.get('/posts', authenticateJWT, getPosts);
router.get('/posts/:id', authenticateJWT, getPostById);
router.put('/posts/:id', authenticateJWT, uploadValidator, updatePost);
router.delete('/posts/:id', authenticateJWT, deletePost);

module.exports = router;