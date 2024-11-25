const db = require('../db/init');
const admin = require('firebase-admin');
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

const searchPost = async (req, res) => {
  try {
    const { query } = req.query;

    // Ensure query is provided and has a length of at least 3
    if (!query || query.length < 3) {
      return error(res, "Search query must be at least 3 characters long", [], 400);
    }

    // Query Firestore for posts with matching titles
    const titleQuery = db
      .collection('posts')
      .where('title', '>=', query)
      .where('title', '<=', query + '\uf8ff');

    const postsSnapshot = await titleQuery.get();

    if (postsSnapshot.empty) {
      return success(res, [], messages.POSTS_NOT_FOUND);
    }

    // Process posts
    const posts = await Promise.all(
      postsSnapshot.docs.map(async (doc) => {
        const postId = doc.id;
        const post = doc.data();

        // Format post
        const formattedPost = {
          id: postId,
          ...post,
          createdAt: post.createdAt?.toMillis() || null,
          updatedAt: post.updatedAt?.toMillis() || null,
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

        // Fetch votes count
        const votesSnapshot = await db.collection('votes').where('postId', '==', postId).get();
        const votesCount = votesSnapshot.size;

        // Fetch comments count
        const commentsSnapshot = await db.collection('comments').where('postId', '==', postId).get();
        const commentsCount = commentsSnapshot.size;

        // Combine post details
        return {
          ...formattedPost,
          user,
          votesCount,
          commentsCount
        };
      })
    );

    return success(res, posts, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const castVote = async (req, res) => {
  const { postId, optionId } = req.body;

  // Validate inputs
  if (!postId || !optionId) {
    return res.status(400).json({ error: "postId and optionId are required." });
  }

  try {
    // Create the vote object
    const newVote = {
      postId,
      optionId,
      userId: req.user?.uid || null,
      createdAt: new Date(),
    };

    // Add the vote to the Firestore database
    const voteRef = await db.collection('votes').add(newVote);

    // Increment vote count for the option
    const optionRef = db.collection('options').doc(optionId);
    await optionRef.update({
      votesCount: admin.firestore.FieldValue.increment(1)
    });

    return res.status(201).json({ id: voteRef.id, ...newVote });
  } catch (err) {
    console.error("Error casting vote:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

const deleteVote = async (req, res) => {
  const { postId, optionId } = req.body;

  // Validate inputs
  if (!postId || !optionId) {
    return res.status(400).json({ error: "postId and optionId are required." });
  }

  try {
    // Check if the vote exists in the database
    const voteQuerySnapshot = await db
      .collection('votes')
      .where('postId', '==', postId)
      .where('optionId', '==', optionId)
      .where('userId', '==', req.user?.uid) 
      .get();

    if (voteQuerySnapshot.empty) {
      return res.status(404).json({ error: "Vote not found." });
    }

    // Get the vote document
    const voteDoc = voteQuerySnapshot.docs[0];
    
    // Delete the vote document
    await voteDoc.ref.delete();

    // Decrement the vote count for the option
    const optionRef = db.collection('options').doc(optionId);
    await optionRef.update({
      votesCount: admin.firestore.FieldValue.increment(-1), // Decrement by 1
    });

    return res.status(200).json({ message: "Vote removed successfully." });
  } catch (err) {
    console.error("Error deleting vote:", err.message);
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

const trendingPosts = async (req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Pagination parameters
    const { page = 1, pageSize = 10 } = req.query;
    const pageValue = parseInt(page, 10);
    const pageSizeValue = parseInt(pageSize, 10);

    // Query Firestore for posts created in the last week
    const postsQuery = db
      .collection('posts')
      .where('createdAt', '>=', oneWeekAgo);
    const postsSnapshot = await postsQuery.get();

    if (postsSnapshot.empty) {
      return success(res, {
        posts: [],
        pagination: {
          currentPage: pageValue,
          totalPages: 0,
          totalPosts: 0,
          pageSize: pageSizeValue,
        },
      }, "No trending posts found.");
    }

    // Process posts with metrics
    const postsWithMetrics = await Promise.all(
      postsSnapshot.docs.map(async (doc) => {
        const postId = doc.id;
        const post = doc.data();

        // Fetch comments count
        const commentsSnapshot = await db
          .collection('comments')
          .where('postId', '==', postId)
          .get();
        const commentsCount = commentsSnapshot.size;

        const votesSnapshot = await db
        .collection('votes')
        .where('postId', '==', postId)
        .get();
        const votesCount = votesSnapshot.size;

        // Fetch user details
        const userDoc = await db.collection('users').doc(post.createdBy).get();
        const user = userDoc.exists
          ? {
              id: userDoc.id,
              name: userDoc.data().name || null,
              profilePicUrl: userDoc.data().profilePicUrl || null,
            }
          : null;

        // Return post with metrics
        return {
          id: postId,
          title: post.title,
          description: post.description || null,
          images: post.images || [],
          createdBy: post.createdBy,
          createdAt: post.createdAt?.toMillis() || null,
          user,
          votesCount,
          commentsCount,
        };
      })
    );

    // Sort posts by combined metric (comments + votes) in descending order
    const sortedPosts = postsWithMetrics.sort((a, b) => 
      b.commentsCount + b.votesCount - (a.commentsCount + a.votesCount)
    );

    // Paginate results
    const totalPosts = sortedPosts.length;
    const totalPages = Math.ceil(totalPosts / pageSizeValue);
    const paginatedPosts = sortedPosts.slice(
      (pageValue - 1) * pageSizeValue,
      pageValue * pageSizeValue
    );

    return success(res, {
      posts: paginatedPosts,
      pagination: {
        currentPage: pageValue,
        totalPages,
        totalPosts,
        pageSize: pageSizeValue,
      },
    }, "success");
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  searchPost,
  castVote,
  deleteVote,
  createComment,
  likeComment,
  unlikeComment,
  trendingPosts
};