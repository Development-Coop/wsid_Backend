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
    const { page = 1, limit = 10, sort = 'title' } = req.query; // Default values for pagination and sorting

    const limitValue = parseInt(limit, 10);
    const pageValue = parseInt(page, 10);

    // Calculate the start point for pagination
    const offset = (pageValue - 1) * limitValue;

    let postsSnapshot;
    if (listAll) {
      postsSnapshot = await db.collection('posts')
                            .orderBy(sort)
                            .offset(offset)
                            .limit(limitValue)
                            .get();
    }else{
      postsSnapshot = await db.collection('posts')
                          .where('createdBy', '==', req.user?.uid || null)
                          .orderBy(sort)
                          .offset(offset)
                          .limit(limitValue)
                          .get();
    }
    const posts = postsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
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

    // Calculate total votes
    const totalVotes = data.options.reduce((sum, option) => sum + (option.votes || 0), 0);

    // Calculate vote percentage for each option
    const updatedOptions = data.options.map(option => {
      const votes = option.votes || 0;
      const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : 0;
      return {
        ...option,
        votes,
        percentage: parseFloat(percentage), // Ensure numeric percentage
      };
    });

    // Prepare the response
    const formattedPost = {
      id: postDoc.id,
      ...data,
      options: updatedOptions, // Include updated options with percentages
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
      return error(res, messages.POST_NOT_FOUND, [], 404);
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

const voteForOption = async (req, res) => {
  const { id } = req.params;
  const { optionText } = req.body;
  const userId = req.user?.uid;

  if (!userId) {
    return error(res, "Unauthorized user", [], 401);
  }

  try {
    const postRef = db.collection('posts').doc(id);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    const postData = postDoc.data();
    let updatedOptions = [];

    // Update the votes and voters
    postData.options.forEach(option => {
      if (option.text === optionText) {
        if (option.voters?.includes(userId)) {
          // Revert vote
          option.votes = (option.votes || 0) - 1;
          option.voters = option.voters.filter(voter => voter !== userId);
        } else {
          // Add vote
          option.votes = (option.votes || 0) + 1;
          option.voters = [...(option.voters || []), userId];
        }
      }
      updatedOptions.push(option);
    });

    // Update the post with the modified options
    await postRef.update({ options: updatedOptions });

    return success(res, { message: messages.VOTE_SUCCESS, options: updatedOptions }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};


module.exports = { 
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
  voteForOption
};