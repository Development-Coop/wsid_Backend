const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase } = require('../helper/firebase_storage');

const createPost = async (req, res) => {
  const { title, description, tags } = req.body;
  const images = req.files; // Assume multiple images are uploaded

  try {
    // Upload images to Firebase
    const imageUrls = [];
    if (images && images.length > 0) {
      for (const image of images) {
        const imageUrl = await uploadFileToFirebase(image);
        imageUrls.push(imageUrl);
      }
    }

    const newPost = {
      title,
      description,
      images: imageUrls,
      tags: tags || [], // Optional tags
      createdAt: new Date(),
    };

    // Save to Firestore
    const postRef = await db.collection('posts').add(newPost);
    return res.status(201).json({ id: postRef.id, ...newPost });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getPosts = async (req, res) => {
  try {
    const postsSnapshot = await db.collection('posts').get();
    const posts = postsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(posts);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
  
const getPostById = async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return res.status(404).json({ message: 'Post not found' });
    }
    return res.status(200).json({ id: postDoc.id, ...postDoc.data() });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const updatePost = async (req, res) => {
  const { id } = req.params;
  const { title, description, tags } = req.body;
  const images = req.files; // For updating images

  try {
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Prepare updated data
    let updatedData = {
      title: title || postDoc.data().title,
      description: description || postDoc.data().description,
      tags: tags || postDoc.data().tags,
    };

    // Update images if provided
    if (images && images.length > 0) {
      const imageUrls = [];
      for (const image of images) {
        const imageUrl = await uploadFileToFirebase(image);
        imageUrls.push(imageUrl);
      }
      updatedData.images = imageUrls;
    }

    await db.collection('posts').doc(id).update(updatedData);
    return res.status(200).json({ message: 'Post updated successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const deletePost = async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return res.status(404).json({ message: 'Post not found' });
    }
    await db.collection('posts').doc(id).delete();
    return res.status(200).json({ message: 'Post deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { 
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost
};