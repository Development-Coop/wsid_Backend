const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase, deleteFileFromFirebase } = require('../helper/firebase_storage');

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
  if (Object.keys(req.body).length === 0 && !req.files) {
    return success(res, { postId }, "No updates provided");
  }
  const { title, description, options: rawOptions, deleteImages: deleteImagesRaw, deleteOptions: deleteOptionsRaw } = req.body;

  try {
    let options = [];
    let deleteImages = [];
    let deleteOptions = [];

    try {
      options = rawOptions ? JSON.parse(rawOptions) : [];
      deleteImages = deleteImagesRaw ? JSON.parse(deleteImagesRaw) : [];
      deleteOptions = deleteOptionsRaw ? JSON.parse(deleteOptionsRaw) : [];
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

    // Delete post images specified in the request body
    if (deleteImages.length > 0) {
      for (const imageUrl of deleteImages) {
        await deleteFileFromFirebase(imageUrl); // Delete from Firebase Storage
        existingPost.images = existingPost.images.filter(url => url !== imageUrl); // Remove from post
      }
    }

    // Handle updating or adding option images
    if (options.length > 0) {
      const updatePromises = options.map(async (option) => {
        const optionImage = req.files.find(file => file.fieldname === option.fileName);
        let optionImageUrl = ""
        if (optionImage) {
          optionImageUrl = await uploadFileToFirebase('post/options', optionImage); // Replace or add new URL
        }

        if (option.id) {
          // Fetch the existing option document
          const optionDoc = await db.collection('options').doc(option.id).get();
          if (!optionDoc.exists) {
            return error(res, `Option with ID ${option.id} does not exist.`, [], 500);
          }
          const existingOption = optionDoc.data();
        
          if (optionImageUrl) {
            // If a new image is provided, delete the old image from Firebase Storage
            if (existingOption.image) {
              await deleteFileFromFirebase(existingOption.image);
            }
          } else {
            // Keep the existing image URL if no new image is provided
            optionImageUrl = existingOption.image;
          }

          // Update existing option
          return db.collection('options').doc(option.id).update({
            text: option.text || existingOption.text,
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

    // Delete options specified in the request body
    if (deleteOptions.length > 0) {
      for (const optionId of deleteOptions) {
        const optionDoc = await db.collection('options').doc(optionId).get();
        if (optionDoc.exists) {
          const optionData = optionDoc.data();
          if (optionData.image) {
            await deleteFileFromFirebase(optionData.image); // Delete option image from Firebase Storage
          }
          await db.collection('options').doc(optionId).delete(); // Delete option document
        }
      }
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
    // Check if the logged-in user has already voted for each option
    const options = await Promise.all(
      optionsSnapshot.docs.map(async (doc) => {
        const option = doc.data();
        const votesSnapshot = await db
          .collection('votes')
          .where('optionId', '==', doc.id)
          .where('userId', '==', req.user?.uid)
          .get();

        const hasVoted = !votesSnapshot.empty; // If a vote exists, the user has voted
        return {
          id: doc.id,
          ...option,
          hasVoted, // Include the vote status for the logged-in user
        };
      })
    );

    // Get comments related to the post
    //const commentsSnapshot = await db.collection('comments').where('postId', '==', postId).get();
    //const comments = commentsSnapshot.docs.map((doc) => {
    //  const commentData = doc.data();
    //  return {
    //    id: doc.id,
    //    ...commentData,
    //    createdAt: commentData.createdAt?.toMillis() || null, // Convert Firestore Timestamp to JS timestamp
    //  };
    //});

    return success(
      res,
      {
        ...formattedPost,
        user,
        options,
        //comments,
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
  trendingPosts
};