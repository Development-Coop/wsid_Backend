const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase } = require('../helper/firebase_storage');

const createPost = async (req, res) => {
  const { title, description, options: rawOptions } = req.body;

  try {
    let options = [];
    try {
      options = rawOptions ? JSON.parse(rawOptions) : [];
    } catch {
      return error(res, messages.INVALID_OPTIONS_FORMAT, [], 400);
    }

    // Upload post images
    const postImages = req.files.filter(file => file.fieldname === 'postImages');
    const postImageUrls = [];
    for (const image of postImages) {
      const imageUrl = await uploadFileToFirebase('post', image);
      postImageUrls.push(imageUrl);
    }

    // Create the post
    const newPost = {
      title,
      description,
      images: postImageUrls,
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };

    const postRef = await db.collection('posts').add(newPost);
    const postId = postRef.id;

    // Upload option images and create options collection
    if (options.length > 0) {
      const optionPromises = options.map(async (option) => {
        const optionImage = req.files.find(file => file.fieldname === option.fileName);
        const optionImageUrl = optionImage ? await uploadFileToFirebase('post/options', optionImage) : null;
        const newOption = {
          postId,
          text: option.text,
          image: optionImageUrl,
          votesCount: 0,
        };
        return db.collection('options').add(newOption);
      });

      await Promise.all(optionPromises);
    }

    return success(res, { postId }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const updatePost = async (req, res) => {
  const { id: postId } = req.params;
  const { title, description, options: rawOptions } = req.body;

  try {
    let options = [];
    try {
      options = rawOptions ? JSON.parse(rawOptions) : [];
    } catch {
      return error(res, messages.INVALID_OPTIONS_FORMAT, [], 400);
    }

    // Fetch the existing post
    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) {
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    // Ensure the logged-in user is the one who created the post or is authorized to update it
    const existingPost = postDoc.data();
    if (existingPost.createdBy !== req.user?.uid) {
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Handle updating or adding post images
    const postImages = req.files.filter(file => file.fieldname === 'postImages');
    const postImageUrls = [...existingPost.images]; // Start with existing images
    for (const image of postImages) {
      const imageUrl = await uploadFileToFirebase('post', image);
      postImageUrls.push(imageUrl); // Add new image URLs
    }

    // Prepare and update post object
    const updatedPost = {
      title: title || existingPost.title,
      description: description || existingPost.description,
      images: postImageUrls,
      updatedAt: new Date(),
    };
    await db.collection('posts').doc(postId).update(updatedPost);

    // Handle updating or adding option images
    if (options.length > 0) {
      const updatePromises = options.map(async (option) => {
        const optionImage = req.files.find(file => file.fieldname === option.fileName);
        let optionImageUrl = ""
        if (optionImage) {
          optionImageUrl = await uploadFileToFirebase('post/options', optionImage); // Replace or add new URL
        }

        if (option.id) {
          // Update existing option
          return db.collection('options').doc(option.id).update({
            text: option.text,
            image: optionImageUrl,
          });
        } else {
          // Add new option
          const newOption = {
            postId,
            text: option.text,
            image: optionImageUrl,
            votesCount: 0,
          };
          return db.collection('options').add(newOption);
        }
      })
      await Promise.all(updatePromises);
    }

    return success(res, { postId }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const deletePost = async (req, res) => {
  const { id: postId } = req.params;

  try {
    // Fetch the existing post
    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) {
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    // Ensure the logged-in user is the one who created the post or is authorized to update it
    const existingPost = postDoc.data();
    if (existingPost.createdBy !== req.user?.uid) {
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Delete options associated with the post
    const optionsSnapshot = await db.collection('options').where('postId', '==', postId).get();
    const deleteOptionsPromises = optionsSnapshot.docs.map((doc) => doc.ref.delete());
    await Promise.all(deleteOptionsPromises);

    // Delete votes associated with the post
    const votesSnapshot = await db.collection('votes').where('postId', '==', postId).get();
    const deleteVotesPromises = votesSnapshot.docs.map((doc) => doc.ref.delete());
    await Promise.all(deleteVotesPromises);

    // Delete comments associated with the post
    const commentsSnapshot = await db.collection('comments').where('postId', '==', postId).get();
    const deleteCommentsPromises = commentsSnapshot.docs.map((doc) => doc.ref.delete());
    await Promise.all(deleteCommentsPromises);

    // Delete the post
    await db.collection('posts').doc(postId).delete();

    return success(res, { }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const getAllPosts = async (req, res) => {
  try {
    // Extract query parameters
    const listAll = req.query.all === 'true';
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    // Calculate the starting point for pagination
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const startAt = (pageNumber - 1) * pageSize;

    let query;
    if (listAll) {
      query = db.collection('posts')
                        .orderBy(sortBy, order)
    }else{
      query = db.collection('posts')
              .where('createdBy', '==', req.user?.uid || null)
              .orderBy(sortBy, order)
    }

    // Fetch the total number of posts for pagination metadata
    const totalSnapshot = await db.collection('posts').get();
    const totalPosts = totalSnapshot.size;

    // Add pagination to the query
    query = query.offset(startAt).limit(pageSize);

    // Execute query
    const postsSnapshot = await query.get();
    const postsPromises = postsSnapshot.docs.map(async (doc) => {
      const post = doc.data();
      const postId = doc.id;

      // Convert Firestore Timestamp to JS timestamp
      post.createdAt = post.createdAt?.toMillis() || null;

      // Fetch user details
      const userDoc = await db.collection('users').doc(post.createdBy).get();
      const user = userDoc.exists ? userDoc.data() : {};

      // Fetch votes count
      const votesSnapshot = await db.collection('votes').where('postId', '==', postId).get();
      const votesCount = votesSnapshot.size;

      // Fetch comments count
      const commentsSnapshot = await db.collection('comments').where('postId', '==', postId).get();
      const commentsCount = commentsSnapshot.size;

      return {
        id: postId,
        ...post,
        user: {
          id: userDoc.id || null,
          name: user.name || null,
          profilePicUrl: user.profilePicUrl || null,
        },
        votesCount,
        commentsCount,
      };
    });

    const posts = await Promise.all(postsPromises);

    // Pagination metadata
    const totalPages = Math.ceil(totalPosts / pageSize);

    return success(res, {
      posts,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalPosts,
        pageSize,
      },
    }, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const getPostById = async (req, res) => {
  const { id: postId } = req.params;

  try {
    // Fetch the existing post
    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) {
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    const post = postDoc.data();

    // Convert Firestore Timestamps to JS timestamps
    const formattedPost = {
      id: postId,
      ...post,
      createdAt: post.createdAt?.toMillis() || null, // Convert Firestore Timestamp to JS timestamp
      updatedAt: post.updatedAt?.toMillis() || null, // Handle cases where updatedAt might be missing
    };

    // Fetch user details
    const userDoc = await db.collection('users').doc(post.createdBy).get();
    const user = userDoc.exists
      ? {
          id: userDoc.id,
          name: userDoc.data().name || null,
          profilePicUrl: userDoc.data().profilePicUrl || null,
        }
      : null;

    // Get options related to the post
    const optionsSnapshot = await db.collection('options').where('postId', '==', postId).get();
    const options = optionsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get comments related to the post
    const commentsSnapshot = await db.collection('comments').where('postId', '==', postId).get();
    const comments = commentsSnapshot.docs.map((doc) => {
      const commentData = doc.data();
      return {
        id: doc.id,
        ...commentData,
        createdAt: commentData.createdAt?.toMillis() || null, // Convert Firestore Timestamp to JS timestamp
      };
    });

    return success(
      res,
      {
        ...formattedPost,
        user,
        options,
        comments,
      },
      messages.SUCCESS
    );
  } catch (err) {
    return error(res, err.message, [], 500);
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

module.exports = { 
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  castVote,
  deleteVote,
  createComment,
  likeComment,
  unlikeComment
};