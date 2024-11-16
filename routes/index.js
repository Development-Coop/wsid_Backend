const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const postRoutes = require('./post');
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/post', postRoutes);

module.exports = router;
