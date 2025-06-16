const db = require('../db/init');
const admin = require('firebase-admin');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const createComment = async (req, res) => {
  const { postId, text, parentId } = req.body; // `parentId` is optional for nested comments
  const userId = req.user?.uid;

  console.log('Creating comment with data:', { postId, text, parentId, userId });

  // add code by karan for comment limit should be 1000
  //  messages.COMMENT_LENTH_VALIDATION this comes from message constants i will add this
  if (!text || text.length > 1000) {
    return error(res, messages.COMMENT_LENTH_VALIDATION, [], 400);
  }

  try {
    // Get user's vote for this post to include with the comment
    let userVote = null;
    
    console.log('Fetching user vote for postId:', postId, 'userId:', userId);
    
    try {
      // Let's try a different approach - get all votes for this post and filter by user
      const allPostVotes = await db.collection('votes').where('postId', '==', postId).get();
      console.log('Total votes for this post:', allPostVotes.size);
      
      // Find the user's vote
      const userVoteDoc = allPostVotes.docs.find(doc => doc.data().userId === userId);
      
      if (userVoteDoc) {
        const voteData = userVoteDoc.data();
        console.log('Found user vote data:', voteData);
        
        // Get the option details for the vote
        console.log('Fetching post details for postId:', postId);
        const postDoc = await db.collection('posts').doc(postId).get();
        
        if (postDoc.exists) {
          const postData = postDoc.data();
          console.log('Post found, now fetching option from options collection...');
          
          // Fetch the option from the separate options collection
          const optionDoc = await db.collection('options').doc(voteData.optionId).get();
          
          if (optionDoc.exists) {
            const optionData = optionDoc.data();
            console.log('Found option data:', optionData);
            
            userVote = {
              optionId: voteData.optionId,
              optionText: optionData.text
            };
            console.log('UserVote created:', userVote);
          } else {
            console.log('Option document does not exist for optionId:', voteData.optionId);
          }
        } else {
          console.log('Post document does not exist for postId:', postId);
        }
      } else {
        console.log('No vote found for this user and post');
        if (allPostVotes.size > 0) {
          console.log('Sample vote for this post:', allPostVotes.docs[0].data());
        }
      }
    } catch (voteError) {
      console.error('Error fetching vote:', voteError);
    }

    const newComment = {
      postId,
      text,
      parentId: parentId || null, // `null` for root comments
      createdBy: userId,
      createdAt: new Date(),
      likes: [],
      dislikes: [],
      likesCount: 0,
      dislikesCount: 0,
      replies: [], // Only relevant for parent comments
      userVote: userVote // Add the user's vote information
    };

    console.log('Creating comment with data:', newComment);

    // Add the new comment
    const commentRef = await db.collection('comments').add(newComment);
    console.log('Comment created with ID:', commentRef.id);

    // If this is a reply, update the parent comment's `replies` array
    if (parentId) {
      console.log('Updating parent comment replies for parentId:', parentId);
      const parentCommentRef = db.collection('comments').doc(parentId);
      await parentCommentRef.update({
        replies: admin.firestore.FieldValue.arrayUnion(commentRef.id),
      });
      console.log('Parent comment updated successfully');
    }

    console.log('Comment creation completed successfully');
    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    console.error('Error creating comment:', err);
    console.error('Error stack:', err.stack);
    return error(res, err.message, [], 500);
  }
};

const updateComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { text } = req.body;

  // add code by karan for comment limit should be 1000
  //  messages.COMMENT_LENTH_VALIDATION this comes from message constants i will add this
  if (!text && text.length > 1000) {
    return error(res, messages.COMMENT_LENTH_VALIDATION, [], 400);
  }

  try {
    // Fetch the comment document
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const comment = commentDoc.data();

    // Ensure the logged-in user is authorized to edit the comment
    if (comment.createdBy !== req.user?.uid) {
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Update the comment's text and `updatedAt` timestamp
    await commentRef.update({
      text: text || comment.text, // Keep old text if no new text is provided
      updatedAt: new Date(),
    });

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const deleteComment = async (req, res) => {
  const { id: commentId } = req.params;

  try {
    // Fetch the comment document
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const comment = commentDoc.data();

    // Ensure the logged-in user is authorized to delete the comment
    if (comment.createdBy !== req.user?.uid && req.user.role === "user") {
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    // Cascade delete child comments
    await cascadeDeleteComments(commentId);

    // Remove reference from the parent's `replies` array, if it exists
    if (comment.parentId) {
      const parentRef = db.collection('comments').doc(comment.parentId);
      await parentRef.update({
        replies: admin.firestore.FieldValue.arrayRemove(commentId),
      });
    }

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

// Helper function to cascade delete child comments
const cascadeDeleteComments = async (parentId) => {
  const repliesSnapshot = await db
    .collection('comments')
    .where('parentId', '==', parentId)
    .get();

  const deletePromises = repliesSnapshot.docs.map(async (doc) => {
    const replyId = doc.id;
    await cascadeDeleteComments(replyId); // Recursively delete child comments
    await db.collection('comments').doc(replyId).delete(); // Delete the comment
  });

  await Promise.all(deletePromises);

  // Finally, delete the parent comment
  await db.collection('comments').doc(parentId).delete();
};

const getAllComment = async (req, res) => {
  const { postId } = req.params;
  const loggedInUserId = req.user.uid;

  try {
    const commentsSnapshot = await db
      .collection('comments')
      .where('postId', '==', postId)
      .where('parentId', '==', null)
      .orderBy('createdAt', 'asc')
      .get();

    const comments = [];

    for (const doc of commentsSnapshot.docs) {
      const commentData = doc.data();
      const userId = commentData.createdBy;

      // Format createdAt to milliseconds
      const createdAtMillis = commentData.createdAt._seconds * 1000 + Math.floor(commentData.createdAt._nanoseconds / 1000000);

      // Fetch user details
      const userDoc = await db.collection('users').doc(userId).get();
      const user = userDoc.exists
        ? {
          id: userDoc.id,
          name: userDoc.data().name,
          profilePicUrl: userDoc.data().profilePicUrl,
        }
        : null;

      // Check if the logged-in user has liked or disliked the current reply
      const hasLiked = commentData.likes && commentData.likes.includes(loggedInUserId);
      const hasDisliked = commentData.dislikes && commentData.dislikes.includes(loggedInUserId);

      // Create the comment object
      const comment = {
        ...commentData,
        id: doc.id,
        createdAt: createdAtMillis,
        createdBy: user,
        likesCount: (commentData.likes || []).length,
        dislikesCount: (commentData.dislikes || []).length,
        hasLiked,
        hasDisliked,
        userVote: commentData.userVote || null, // Include vote information
        replies: await getNestedReplies(doc.id, loggedInUserId),
      };

      console.log('Comment being returned:', {
        id: comment.id,
        text: comment.text,
        userVote: comment.userVote,
        createdBy: comment.createdBy?.name
      });

      comments.push(comment);
    }

    return success(res, comments, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const getNestedReplies = async (parentId, loggedInUserId) => {
  const repliesSnapshot = await db
    .collection('comments')
    .where('parentId', '==', parentId)
    .orderBy('createdAt', 'asc')
    .get();

  const replies = [];
  for (const doc of repliesSnapshot.docs) {
    const replyData = doc.data();
    const userId = replyData.createdBy;

    // Format createdAt to milliseconds
    const createdAtMillis = replyData.createdAt._seconds * 1000 + Math.floor(replyData.createdAt._nanoseconds / 1000000);

    // Fetch user details
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.exists
      ? {
        id: userDoc.id,
        name: userDoc.data().name,
        profilePicUrl: userDoc.data().profilePicUrl,
      }
      : null;

    // Check if the logged-in user has liked or disliked the current reply
    const hasLiked = replyData.likes && replyData.likes.includes(loggedInUserId);
    const hasDisliked = replyData.dislikes && replyData.dislikes.includes(loggedInUserId);

    const reply = {
      ...replyData,
      id: doc.id,
      createdAt: createdAtMillis,
      createdBy: user,
      likesCount: (replyData.likes || []).length,
      dislikesCount: (replyData.dislikes || []).length,
      hasLiked,
      hasDisliked,
      userVote: replyData.userVote || null, // Include vote information for replies too
      replies: await getNestedReplies(doc.id, loggedInUserId),
    };

    replies.push(reply);
  }

  return replies;
};

const likeComment = async (req, res) => {
  const { id: commentId } = req.params;
  const userId = req.user?.uid;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const comment = commentDoc.data();

    const updates = {};

    if (comment.likes.includes(userId)) {
      updates.likes = admin.firestore.FieldValue.arrayRemove(userId);
      updates.likesCount = admin.firestore.FieldValue.increment(-1);
    } else {
      updates.likes = admin.firestore.FieldValue.arrayUnion(userId);
      updates.likesCount = admin.firestore.FieldValue.increment(1);

      // ✅ Remove dislike if it exists (can't like & dislike at same time)
      if (comment.dislikes.includes(userId)) {
        updates.dislikes = admin.firestore.FieldValue.arrayRemove(userId);
        updates.dislikesCount = admin.firestore.FieldValue.increment(-1);
      }
    }

    await commentRef.update(updates);

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const dislikeComment = async (req, res) => {
  const { id: commentId } = req.params;
  const userId = req.user?.uid;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const comment = commentDoc.data();

    const updates = {};

    if (comment.dislikes.includes(userId)) {
      updates.dislikes = admin.firestore.FieldValue.arrayRemove(userId);
      updates.dislikesCount = admin.firestore.FieldValue.increment(-1);
    } else {
      updates.dislikes = admin.firestore.FieldValue.arrayUnion(userId);
      updates.dislikesCount = admin.firestore.FieldValue.increment(1);

      // ✅ Remove like if it exists
      if (comment.likes.includes(userId)) {
        updates.likes = admin.firestore.FieldValue.arrayRemove(userId);
        updates.likesCount = admin.firestore.FieldValue.increment(-1);
      }
    }

    await commentRef.update(updates);

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const getLikesDislikesDetails = async (req, res) => {
  const { commentId, type } = req.params; // type can be 'likes' or 'dislikes'

  try {
    const commentDoc = await db.collection('comments').doc(commentId).get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const commentData = commentDoc.data();
    const userIds = commentData[type] || []; // 'likes' or 'dislikes'

    const userDetails = await Promise.all(
      userIds.map(async (userId) => {
        const userDoc = await db.collection('users').doc(userId).get();
        return userDoc.exists
          ? {
            id: userDoc.id,
            name: userDoc.data().name,
            profilePicUrl: userDoc.data().profilePicUrl,
          }
          : null;
      })
    );

    return success(res, userDetails.filter(Boolean), messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = {
  createComment,
  updateComment,
  deleteComment,
  getAllComment,
  likeComment,
  dislikeComment,
  getLikesDislikesDetails
};