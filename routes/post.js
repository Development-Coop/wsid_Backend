const express = require('express');
const { 
    createPost,
    getPosts,
    getPostById,
    updatePost,
    deletePost,
    voteForOption 
} = require('./../controllers/postController');
const validateRequest = require('../helper/validator');
const { authenticateJWT } = require('../helper/jwt');
const uploadValidator = require('../helper/multer');
const { 
  editProfileSchema
} = require('../model/request');
const router = express.Router();

router.post('/create', authenticateJWT, uploadValidator(), createPost);
router.get('/get', authenticateJWT, getPosts);
router.get('/get/:id', authenticateJWT, getPostById);
router.put('/update/:id', authenticateJWT, uploadValidator(), updatePost);
router.delete('/delete/:id', authenticateJWT, deletePost);
router.post('/vote/:id', authenticateJWT, voteForOption);

module.exports = router;