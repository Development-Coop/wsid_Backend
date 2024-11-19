const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const postRoutes = require('./post');
const postsRoutes = require('./posts');
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/post', postRoutes);
router.use('/posts', postsRoutes);

module.exports = router;
