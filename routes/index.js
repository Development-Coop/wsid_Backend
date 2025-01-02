const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const postRoutes = require('./post');
const voteRoutes = require('./vote');
const commentRoutes = require('./comment');
const miscRoutes = require('./misc');
const adminRoutes = require('./admin');
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/post', postRoutes);
router.use('/vote', voteRoutes);
router.use('/comment', commentRoutes);
router.use('/misc', miscRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
