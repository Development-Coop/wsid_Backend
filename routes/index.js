const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const postRoutes = require('./post');
const miscRoutes = require('./misc');
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/post', postRoutes);
router.use('/misc', miscRoutes);

module.exports = router;
