const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase } = require('../helper/firebase_storage');

const createPost = async (req, res) => {
  const { title, description, images } = req.body;

  try {
    const newPost = {
      title,
      description,
      images,
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };

    const postRef = await db.collection('posts').add(newPost);
    return res.status(201).json({ id: postRef.id, ...newPost });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getAllPosts = async (req, res) => {
  try {
    // Extract query parameters
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    // Calculate the starting point for pagination
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const startAt = (pageNumber - 1) * pageSize;

    // Build Firestore query
    let query = db.collection('posts').orderBy(sortBy, order);

    // Fetch the total number of posts for pagination metadata
    const totalSnapshot = await db.collection('posts').get();
    const totalPosts = totalSnapshot.size;

    // Add pagination to the query
    query = query.offset(startAt).limit(pageSize);

    // Execute query
    const postsSnapshot = await query.get();
    const posts = postsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis() || null, // Convert Firestore Timestamp to JS timestamp
    }));

    // Pagination metadata
    const totalPages = Math.ceil(totalPosts / pageSize);

    return res.status(200).json({
      posts,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalPosts,
        pageSize,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getPostById = async (req, res) => {
  const { id } = req.params;

  try {
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }
    return res.status(200).json({ id: postDoc.id, ...postDoc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const updatePost = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const postRef = db.collection('posts').doc(id);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Post not found" });
    }

    await postRef.update(updates);
    return res.status(200).json({ message: "Post updated successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const deletePost = async (req, res) => {
  const { id } = req.params;

  try {
    await db.collection('posts').doc(id).delete();
    return res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const createOption = async (req, res) => {
  const { postId, text, image } = req.body;

  try {
    const newOption = {
      postId,
      text,
      image,
      votesCount: 0,
    };

    const optionRef = await db.collection('postOptions').add(newOption);
    return res.status(201).json({ id: optionRef.id, ...newOption });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getOptionsByPostId = async (req, res) => {
  const { postId } = req.params;

  try {
    const optionsSnapshot = await db.collection('postOptions').where('postId', '==', postId).get();
    const options = optionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(options);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const updateOption = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const optionRef = db.collection('postOptions').doc(id);
    await optionRef.update(updates);
    return res.status(200).json({ message: "Option updated successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const deleteOption = async (req, res) => {
  const { id } = req.params;

  try {
    await db.collection('postOptions').doc(id).delete();
    return res.status(200).json({ message: "Option deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const castVote = async (req, res) => {
  const { postId, optionId } = req.body;

  try {
    const newVote = {
      postId,
      optionId,
      userId: req.user?.uid || null,
      createdAt: new Date(),
    };

    const voteRef = await db.collection('votes').add(newVote);

    // Increment vote count for the option
    const optionRef = db.collection('postOptions').doc(optionId);
    await optionRef.update({
      votesCount: admin.firestore.FieldValue.increment(1),
    });

    return res.status(201).json({ id: voteRef.id, ...newVote });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const deleteVote = async (req, res) => {
  const { voteId, optionId } = req.params;

  try {
    await db.collection('votes').doc(voteId).delete();

    // Decrement vote count for the option
    const optionRef = db.collection('postOptions').doc(optionId);
    await optionRef.update({
      votesCount: admin.firestore.FieldValue.increment(-1),
    });

    return res.status(200).json({ message: "Vote deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const createComment = async (req, res) => {
  const { postId, text } = req.body;

  try {
    const newComment = {
      postId,
      text,
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
    };

    const commentRef = await db.collection('comments').add(newComment);
    return res.status(201).json({ id: commentRef.id, ...newComment });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const likeComment = async (req, res) => {
  const { commentId } = req.params;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    await commentRef.update({
      likes: admin.firestore.FieldValue.arrayUnion(req.user?.uid),
      likesCount: admin.firestore.FieldValue.increment(1),
    });

    return res.status(200).json({ message: "Comment liked successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const unlikeComment = async (req, res) => {
  const { commentId } = req.params;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    await commentRef.update({
      likes: admin.firestore.FieldValue.arrayRemove(req.user?.uid),
      likesCount: admin.firestore.FieldValue.increment(-1),
    });

    return res.status(200).json({ message: "Comment unliked successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getCommentsByPostId = async (req, res) => {
  const { postId } = req.params;

  try {
    const commentsSnapshot = await db.collection('comments').where('postId', '==', postId).get();
    const comments = commentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(comments);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};


module.exports = { 
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
};