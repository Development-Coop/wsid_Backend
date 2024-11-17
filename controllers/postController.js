const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase } = require('../helper/firebase_storage');

const createPost = async (req, res) => {
  const { title, description, options: rawOptions } = req.body;

  try {
    // Parse options JSON from the request body
    const options = rawOptions ? JSON.parse(rawOptions) : [];

    // Separate `postImages` from `options` images
    const postImages = req.files.filter(file => file.fieldname === 'postImages');
    const optionImages = req.files.filter(file => options.some(option => file.fieldname === option.text));

    // Upload post images
    const postImageUrls = [];
    for (const image of postImages) {
      const imageUrl = await uploadFileToFirebase('post', image);
      postImageUrls.push(imageUrl);
    } 

    // Upload option images and enrich options with URLs
    const updatedOptions = await Promise.all(
      options.map(async (option) => {
        const optionImage = optionImages.find(file => file.fieldname === option.text);
        let optionImageUrl = null;

        if (optionImage) {
          optionImageUrl = await uploadFileToFirebase('post/options', optionImage);
        }

        return {
          ...option,
          image: optionImageUrl, // Add single image URL to each option
        };
      })
    );

    // Prepare the new post object
    const newPost = {
      title,
      description,
      images: postImageUrls,
      options: updatedOptions,
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };

    // Save to Firestore
    const postRef = await db.collection('posts').add(newPost);
    return success(res, { id: postRef.id, ...newPost }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const getPosts = async (req, res) => {
  try {
    const listAll = req.query.all === 'true';
    let postsSnapshot;
    if (listAll) {
      postsSnapshot = await db.collection('posts').get();
    }else{
      postsSnapshot = await await db.collection('posts').where('createdBy', '==', req.user?.uid || null).get();
    }
    const posts = postsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toMillis() || null, // Convert Firestore Timestamp to JS timestamp
      };
    });
    return success(res, posts, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};
  
const getPostById = async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }
    const data = postDoc.data();
    const formattedPost = {
      id: postDoc.id,
      ...data,
      createdAt: data.createdAt?.toMillis() || null, // Convert Firestore Timestamp to JS timestamp
    };
    return success(res, formattedPost, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const updatePost = async (req, res) => {
  const { id } = req.params;
  const { title, description, options: rawOptions } = req.body;

  try {
    // Parse options JSON from the request body
    const options = rawOptions ? JSON.parse(rawOptions) : [];

    // Fetch the existing post
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    const existingPost = postDoc.data();

    // Ensure the logged-in user is the one who created the post or is authorized to update it
    if (existingPost.createdBy !== req.user?.uid) {
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Separate `postImages` and `options` images
    const postImages = req.files.filter(file => file.fieldname === 'postImages');
    const optionImages = req.files.filter(file => options.some(option => file.fieldname === option.text));

    // Handle updating or adding post images
    const postImageUrls = [...existingPost.images]; // Start with existing images
    for (const image of postImages) {
      const imageUrl = await uploadFileToFirebase('post', image);
      postImageUrls.push(imageUrl); // Add new image URLs
    }

    // Handle updating or adding option images
    const updatedOptions = await Promise.all(
      options.map(async (option) => {
        const existingOption = existingPost.options.find(opt => opt.text === option.text);
        const optionImage = optionImages.find(file => file.fieldname === option.text);
        let optionImageUrl = existingOption?.image || null; // Use existing URL if available

        if (optionImage) {
          optionImageUrl = await uploadFileToFirebase('post/options', optionImage); // Replace or add new URL
        }

        return {
          ...option,
          image: optionImageUrl, // Update or add image URL
        };
      })
    );

    // Prepare the updated post object
    const updatedPost = {
      title: title || existingPost.title,
      description: description || existingPost.description,
      images: postImageUrls,
      options: updatedOptions,
      updatedBy: req.user?.uid,  // Log the user who updated the post
      updatedAt: new Date(),
    };

    // Update Firestore
    const postRef = await db.collection('posts').doc(id).update(updatedPost);
    return success(res, { id: postRef.id, ...updatedPost }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};


const deletePost = async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const postData = postDoc.data();
    const loggedInUserId = req.user.uid;

    // Check if the logged-in user is the creator of the post
    if (postData.createdBy !== loggedInUserId) {
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    await db.collection('posts').doc(id).delete();
    return success(res, [], messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost
};