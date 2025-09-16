const db = require("../db/init");
const messages = require("../constants/messages");
const { success, error } = require("../model/response");
const {
  uploadFileToFirebase,
  deleteFileFromFirebase,
} = require("../helper/firebase_storage");

const createPost = async (req, res) => {
  const { title, description, options: rawOptions } = req.body;
  console.log(
    `[CREATE_POST] User: ${req.user?.uid}, Title: ${title}, Description: "${description}"`
  );

  try {
    let options = [];
    try {
      options = rawOptions ? JSON.parse(rawOptions) : [];
      console.log(`[CREATE_POST] Parsed ${options.length} options`);
    } catch {
      console.log("[CREATE_POST] Failed to parse options");
      return error(res, messages.INVALID_OPTIONS_FORMAT, [], 400);
    }

    // Upload post images
    const postImages = req.files.filter(
      (file) => file.fieldname === "postImages"
    );
    console.log(`[CREATE_POST] Uploading ${postImages.length} post images`);
    const postImageUrls = [];
    for (const image of postImages) {
      const imageUrl = await uploadFileToFirebase("post", image);
      postImageUrls.push(imageUrl);
    }

    // Create the post - allow description to be empty string or null
    const newPost = {
      title,
      description: description || "", // Allow empty description
      images: postImageUrls,
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
    };

    const postRef = await db.collection("posts").add(newPost);
    const postId = postRef.id;
    console.log(`[CREATE_POST] Created post with ID: ${postId}`);

    // Upload option images and create options collection
    if (options.length > 0) {
      console.log(`[CREATE_POST] Processing ${options.length} options`);
      const optionPromises = options.map(async (option) => {
        const optionImage = req.files.find(
          (file) => file.fieldname === option.fileName
        );
        const optionImageUrl = optionImage
          ? await uploadFileToFirebase("post/options", optionImage)
          : null;
        const newOption = {
          postId,
          text: option.text,
          image: optionImageUrl,
          votesCount: 0,
        };
        return db.collection("options").add(newOption);
      });

      await Promise.all(optionPromises);
      console.log(`[CREATE_POST] Successfully created all options`);
    }

    return success(res, { postId }, messages.SUCCESS);
  } catch (err) {
    console.error(`[CREATE_POST] Error:`, err.message);
    return error(res, err.message, [], 500);
  }
};

const updatePost = async (req, res) => {
  const { id: postId } = req.params;
  console.log(`[UPDATE_POST] Post ID: ${postId}, User: ${req.user?.uid}`);

  if (Object.keys(req.body).length === 0 && !req.files) {
    console.log("[UPDATE_POST] No updates provided");
    return success(res, { postId }, "No updates provided");
  }
  const {
    title,
    description,
    options: rawOptions,
    deleteImages: deleteImagesRaw,
    deleteOptions: deleteOptionsRaw,
  } = req.body;

  try {
    let options = [];
    let deleteImages = [];
    let deleteOptions = [];

    try {
      options = rawOptions ? JSON.parse(rawOptions) : [];
      deleteImages = deleteImagesRaw ? JSON.parse(deleteImagesRaw) : [];
      deleteOptions = deleteOptionsRaw ? JSON.parse(deleteOptionsRaw) : [];
      console.log(
        `[UPDATE_POST] Parsed: ${options.length} options, ${deleteImages.length} images to delete, ${deleteOptions.length} options to delete`
      );
    } catch {
      console.log("[UPDATE_POST] Failed to parse JSON data");
      return error(res, messages.INVALID_OPTIONS_FORMAT, [], 400);
    }

    // Fetch the existing post
    const postDoc = await db.collection("posts").doc(postId).get();
    if (!postDoc.exists) {
      console.log(`[UPDATE_POST] Post not found: ${postId}`);
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    // Ensure the logged-in user is the one who created the post or is authorized to update it
    const existingPost = postDoc.data();
    if (existingPost.createdBy !== req.user?.uid) {
      console.log(
        `[UPDATE_POST] Unauthorized access attempt by ${req.user?.uid} for post created by ${existingPost.createdBy}`
      );
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Handle updating or adding post images
    const postImages = req.files.filter(
      (file) => file.fieldname === "postImages"
    );
    const postImageUrls = [...existingPost.images]; // Start with existing images
    for (const image of postImages) {
      const imageUrl = await uploadFileToFirebase("post", image);
      postImageUrls.push(imageUrl); // Add new image URLs
    }

    // Prepare and update post object - allow description to be empty
    const updatedPost = {
      title: title || existingPost.title,
      description:
        description !== undefined ? description : existingPost.description, // Allow empty string
      images: postImageUrls,
      updatedAt: new Date(),
    };
    await db.collection("posts").doc(postId).update(updatedPost);

    // Delete post images specified in the request body
    if (deleteImages.length > 0) {
      for (const imageUrl of deleteImages) {
        await deleteFileFromFirebase(imageUrl); // Delete from Firebase Storage
        existingPost.images = existingPost.images.filter(
          (url) => url !== imageUrl
        ); // Remove from post
      }
    }

    // Handle updating or adding option images
    if (options.length > 0) {
      const updatePromises = options.map(async (option) => {
        const optionImage = req.files.find(
          (file) => file.fieldname === option.fileName
        );
        let optionImageUrl = "";
        if (optionImage) {
          optionImageUrl = await uploadFileToFirebase(
            "post/options",
            optionImage
          ); // Replace or add new URL
        }

        if (option.id) {
          // Fetch the existing option document
          const optionDoc = await db.collection("options").doc(option.id).get();
          if (!optionDoc.exists) {
            return error(
              res,
              `Option with ID ${option.id} does not exist.`,
              [],
              500
            );
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
          return db
            .collection("options")
            .doc(option.id)
            .update({
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
          return db.collection("options").add(newOption);
        }
      });
      await Promise.all(updatePromises);
    }

    // Delete options specified in the request body
    if (deleteOptions.length > 0) {
      for (const optionId of deleteOptions) {
        const optionDoc = await db.collection("options").doc(optionId).get();
        if (optionDoc.exists) {
          const optionData = optionDoc.data();
          if (optionData.image) {
            await deleteFileFromFirebase(optionData.image); // Delete option image from Firebase Storage
          }
          await db.collection("options").doc(optionId).delete(); // Delete option document
        }
      }
    }

    console.log(`[UPDATE_POST] Successfully updated post: ${postId}`);
    return success(res, { postId }, messages.SUCCESS);
  } catch (err) {
    console.error(`[UPDATE_POST] Error:`, err.message);
    return error(res, err.message, [], 500);
  }
};

const deletePost = async (req, res) => {
  const { id: postId } = req.params;
  console.log(`[DELETE_POST] Post ID: ${postId}, User: ${req.user?.uid}`);

  try {
    // Fetch the existing post
    const postDoc = await db.collection("posts").doc(postId).get();
    if (!postDoc.exists) {
      console.log(`[DELETE_POST] Post not found: ${postId}`);
      return error(res, messages.POST_NOT_FOUND, [], 404);
    }

    // Ensure the logged-in user is the one who created the post or is authorized to update it
    const existingPost = postDoc.data();
    if (existingPost.createdBy !== req.user?.uid && req.user.role === "user") {
      console.log(`[DELETE_POST] Unauthorized access attempt`);
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Delete options associated with the post
    const optionsSnapshot = await db
      .collection("options")
      .where("postId", "==", postId)
      .get();
    const deleteOptionsPromises = optionsSnapshot.docs.map((doc) =>
      doc.ref.delete()
    );
    await Promise.all(deleteOptionsPromises);
    console.log(`[DELETE_POST] Deleted ${optionsSnapshot.size} options`);

    // Delete votes associated with the post
    const votesSnapshot = await db
      .collection("votes")
      .where("postId", "==", postId)
      .get();
    const deleteVotesPromises = votesSnapshot.docs.map((doc) =>
      doc.ref.delete()
    );
    await Promise.all(deleteVotesPromises);
    console.log(`[DELETE_POST] Deleted ${votesSnapshot.size} votes`);

    // Delete comments associated with the post
    const commentsSnapshot = await db
      .collection("comments")
      .where("postId", "==", postId)
      .get();
    const deleteCommentsPromises = commentsSnapshot.docs.map((doc) =>
      doc.ref.delete()
    );
    await Promise.all(deleteCommentsPromises);
    console.log(`[DELETE_POST] Deleted ${commentsSnapshot.size} comments`);

    // Delete the post
    await db.collection("posts").doc(postId).delete();
    console.log(`[DELETE_POST] Successfully deleted post: ${postId}`);

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    console.error(`[DELETE_POST] Error:`, err.message);
    return error(res, err.message, [], 500);
  }
};

const getAllPosts = async (req, res) => {
  try {
    // Extract query parameters
    const uid = req.query.uid || req.user.uid;
    const listAll = req.query.all === "true";
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
      search,
    } = req.query;
    console.log(
      `[GET_ALL_POSTS] User: ${uid}, ListAll: ${listAll}, Page: ${page}, Limit: ${limit}, Search: "${search}"`
    );

    // Calculate the starting point for pagination
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const startAt = (pageNumber - 1) * pageSize;

    let query;
    if (listAll) {
      query = db.collection("posts").orderBy(sortBy, order);
    } else {
      query = db
        .collection("posts")
        .where("createdBy", "==", uid || null)
        .orderBy(sortBy, order);
    }

    // Add search filter for title
    if (search) {
      query = query
        .where("title", ">=", search)
        .where("title", "<=", search + "\uf8ff");
    }

    // Fetch the total number of posts for pagination metadata
    let totalQuery = listAll
      ? db.collection("posts")
      : db.collection("posts").where("createdBy", "==", uid || null);

    if (search) {
      totalQuery = totalQuery
        .where("title", ">=", search)
        .where("title", "<=", search + "\uf8ff");
    }

    const totalSnapshot = await totalQuery.get();
    const totalPosts = totalSnapshot.size;

    // Add pagination to the query
    query = query.offset(startAt).limit(pageSize);

    // Execute query
    const postsSnapshot = await query.get();

    const postsPromises = postsSnapshot.docs.map(async (doc) => {
      const post = doc.data();
      const postId = doc.id;

      post.createdAt = post.createdAt?.toMillis() || null;

      const userDoc = await db.collection("users").doc(post.createdBy).get();
      const user = userDoc.exists ? userDoc.data() : {};

      const votesSnapshot = await db
        .collection("votes")
        .where("postId", "==", postId)
        .get();
      const votesCount = votesSnapshot.size;

      const commentsSnapshot = await db
        .collection("comments")
        .where("postId", "==", postId)
        .get();
      const commentsCount = commentsSnapshot.size;

      const userVoteSnapshot = await db
        .collection("votes")
        .where("postId", "==", postId)
        .where("userId", "==", uid)
        .limit(1)
        .get();

      const hasVoted = !userVoteSnapshot.empty;

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
        hasVoted,
      };
    });

    const posts = await Promise.all(postsPromises);
    console.log(
      `[GET_ALL_POSTS] Retrieved ${posts.length} posts, Total: ${totalPosts}`
    );

    // Pagination metadata
    const totalPages = Math.ceil(totalPosts / pageSize);

    return success(
      res,
      {
        posts,
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalPosts,
          pageSize,
        },
      },
      messages.SUCCESS
    );
  } catch (err) {
    console.error(`[GET_ALL_POSTS] Error:`, err.message);
    return error(res, err.message, [], 500);
  }
};

const getPostById = async (req, res) => {
  const { id: postId } = req.params;
  console.log(`[GET_POST_BY_ID] Post ID: ${postId}, User: ${req.user?.uid}`);

  try {
    // Fetch the existing post
    const postDoc = await db.collection("posts").doc(postId).get();
    if (!postDoc.exists) {
      console.log(`[GET_POST_BY_ID] Post not found: ${postId}`);
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
    const userDoc = await db.collection("users").doc(post.createdBy).get();
    const user = userDoc.exists
      ? {
          id: userDoc.id,
          name: userDoc.data().name || null,
          profilePicUrl: userDoc.data().profilePicUrl || null,
        }
      : null;

    // Get options related to the post
    const optionsSnapshot = await db
      .collection("options")
      .where("postId", "==", postId)
      .get();
    console.log(
      `[GET_POST_BY_ID] Found ${optionsSnapshot.size} options for post`
    );
    // Check if the logged-in user has already voted for each option
    const options = await Promise.all(
      optionsSnapshot.docs.map(async (doc) => {
        const option = doc.data();
        const userVoteSnapshot = await db
          .collection("votes")
          .where("postId", "==", postId)
          .where("userId", "==", req.user?.uid)
          .limit(1)
          .get();

        const hasVoted = !userVoteSnapshot.empty;
        return {
          id: doc.id,
          ...option,
          hasVoted, // Include the vote status for the logged-in user
        };
      })
    );

    console.log(`[GET_POST_BY_ID] Successfully retrieved post: ${postId}`);
    return success(
      res,
      {
        ...formattedPost,
        user,
        options,
      },
      messages.SUCCESS
    );
  } catch (err) {
    console.error(`[GET_POST_BY_ID] Error:`, err.message);
    return error(res, err.message, [], 500);
  }
};

const searchPost = async (req, res) => {
  try {
    const { query } = req.query;
    console.log(`[SEARCH_POST] Query: "${query}"`);

    // Ensure query is provided and has a length of at least 3
    if (!query || query.length < 3) {
      console.log("[SEARCH_POST] Query too short");
      return error(
        res,
        "Search query must be at least 3 characters long",
        [],
        400
      );
    }

    // Query Firestore for posts with matching titles
    const titleQuery = db
      .collection("posts")
      .where("title", ">=", query)
      .where("title", "<=", query + "\uf8ff");

    const postsSnapshot = await titleQuery.get();

    if (postsSnapshot.empty) {
      console.log("[SEARCH_POST] No posts found");
      return success(res, [], messages.POSTS_NOT_FOUND);
    }

    console.log(`[SEARCH_POST] Found ${postsSnapshot.size} matching posts`);

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
        const userDoc = await db.collection("users").doc(post.createdBy).get();
        const user = userDoc.exists
          ? {
              id: userDoc.id,
              name: userDoc.data().name || null,
              profilePicUrl: userDoc.data().profilePicUrl || null,
            }
          : null;

        // Fetch votes count
        const votesSnapshot = await db
          .collection("votes")
          .where("postId", "==", postId)
          .get();
        const votesCount = votesSnapshot.size;

        // Fetch comments count
        const commentsSnapshot = await db
          .collection("comments")
          .where("postId", "==", postId)
          .get();
        const commentsCount = commentsSnapshot.size;

        const userVoteSnapshot = await db
          .collection("votes")
          .where("postId", "==", postId)
          .where("userId", "==", req.user?.uid)
          .limit(1)
          .get();

        const hasVoted = !userVoteSnapshot.empty;

        // Combine post details
        return {
          ...formattedPost,
          user,
          votesCount,
          commentsCount,
          hasVoted,
        };
      })
    );

    return success(res, posts, messages.SUCCESS);
  } catch (err) {
    console.error(`[SEARCH_POST] Error:`, err.message);
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
    const uid = req.user?.uid; // Get current user ID
    console.log(
      `[TRENDING_POSTS] Page: ${pageValue}, PageSize: ${pageSizeValue}, User: ${uid}`
    );

    // Query Firestore for posts created in the last week
    const postsQuery = db
      .collection("posts")
      .where("createdAt", ">=", oneWeekAgo);
    const postsSnapshot = await postsQuery.get();

    if (postsSnapshot.empty) {
      console.log("[TRENDING_POSTS] No posts found in the last week");
      return success(
        res,
        {
          posts: [],
          pagination: {
            currentPage: pageValue,
            totalPages: 0,
            totalPosts: 0,
            pageSize: pageSizeValue,
          },
        },
        "No trending posts found."
      );
    }

    console.log(
      `[TRENDING_POSTS] Processing ${postsSnapshot.size} posts from last week`
    );

    // Process posts with metrics
    const postsWithMetrics = await Promise.all(
      postsSnapshot.docs.map(async (doc) => {
        const postId = doc.id;
        const post = doc.data();

        // Fetch comments from the past week only
        const commentsSnapshot = await db
          .collection("comments")
          .where("postId", "==", postId)
          .where("createdAt", ">=", oneWeekAgo)
          .get();
        const commentsCount = commentsSnapshot.size;

        // Fetch votes from the past week only
        const votesSnapshot = await db
          .collection("votes")
          .where("postId", "==", postId)
          .where("createdAt", ">=", oneWeekAgo)
          .get();
        const votesCount = votesSnapshot.size;

        // Fetch user details
        const userDoc = await db.collection("users").doc(post.createdBy).get();
        const user = userDoc.exists
          ? {
              id: userDoc.id,
              name: userDoc.data().name || null,
              profilePicUrl: userDoc.data().profilePicUrl || null,
            }
          : null;

        // Check if current user has voted on this post
        const userVoteSnapshot = await db
          .collection("votes")
          .where("postId", "==", postId)
          .where("userId", "==", uid)
          .limit(1)
          .get();

        const hasVoted = !userVoteSnapshot.empty;

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
          hasVoted,
          engagementScore: commentsCount + votesCount, // Add engagement score for easier sorting
        };
      })
    );

    // Sort posts by engagement score (descending), then by createdAt (descending) as tiebreaker
    const sortedPosts = postsWithMetrics.sort((a, b) => {
      // First, compare by engagement score
      const engagementDiff = b.engagementScore - a.engagementScore;
      if (engagementDiff !== 0) {
        return engagementDiff;
      }
      // If engagement is the same, sort by creation time (newest first)
      return b.createdAt - a.createdAt;
    });

    // Add debugging logs
    console.log("[TRENDING_POSTS] First 3 sorted posts:");
    sortedPosts.slice(0, 3).forEach((post, index) => {
      console.log(
        `${index + 1}. ID: ${post.id}, Engagement: ${
          post.engagementScore
        }, Created: ${new Date(post.createdAt).toISOString()}`
      );
    });

    console.log(
      `[TRENDING_POSTS] Sorted posts by engagement score with time tiebreaker`
    );

    // Paginate results
    const totalPosts = sortedPosts.length;
    const totalPages = Math.ceil(totalPosts / pageSizeValue);
    const startIndex = (pageValue - 1) * pageSizeValue;
    const endIndex = pageValue * pageSizeValue;

    console.log(
      `[TRENDING_POSTS] Pagination: startIndex=${startIndex}, endIndex=${endIndex}`
    );

    const paginatedPosts = sortedPosts.slice(startIndex, endIndex);

    // Log the paginated results
    console.log("[TRENDING_POSTS] Paginated posts:");
    paginatedPosts.forEach((post, index) => {
      console.log(
        `${startIndex + index + 1}. ID: ${post.id}, Engagement: ${
          post.engagementScore
        }, Created: ${new Date(post.createdAt).toISOString()}`
      );
    });

    return success(
      res,
      {
        posts: paginatedPosts,
        pagination: {
          currentPage: pageValue,
          totalPages,
          totalPosts,
          pageSize: pageSizeValue,
        },
      },
      "success"
    );
  } catch (err) {
    console.error(`[TRENDING_POSTS] Error:`, err.message);
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
  trendingPosts,
};
