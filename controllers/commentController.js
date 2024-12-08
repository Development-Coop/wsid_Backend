const db = require('../db/init');
const admin = require('firebase-admin');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const createComment = async (req, res) => {
  const { postId, text, parentId } = req.body; // `parentId` is optional for nested comments

  try {
    const newComment = {
      postId,
      text,
      parentId: parentId || null, // `null` for root comments
      createdBy: req.user?.uid || null,
      createdAt: new Date(),
      likes: [],
      dislikes: [],
      likesCount: 0,
      dislikesCount: 0,
      replies: [], // Only relevant for parent comments
    };

    // Add the new comment
    const commentRef = await db.collection('comments').add(newComment);

    // If this is a reply, update the parent comment's `replies` array
    if (parentId) {
      const parentCommentRef = db.collection('comments').doc(parentId);
      await parentCommentRef.update({
        replies: admin.firestore.FieldValue.arrayUnion(commentRef.id),
      });
    }

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const updateComment = async (req, res) => {
  const { id: commentId } = req.params;
  const { text } = req.body;

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
    if (comment.createdBy !== req.user?.uid) {
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
        replies: await getNestedReplies(doc.id, loggedInUserId),
      };

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
      replies: await getNestedReplies(doc.id, loggedInUserId),
    };

    replies.push(reply);
  }

  return replies;
};

const likeComment = async (req, res) => {
  const { id: commentId } = req.params;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const comment = commentDoc.data();
    const userId = req.user?.uid;

    if (comment.likes.includes(userId)) {
      // Undo like
      await commentRef.update({
        likes: admin.firestore.FieldValue.arrayRemove(userId),
        likesCount: admin.firestore.FieldValue.increment(-1),
      });
    } else {
      // Like the comment
      await commentRef.update({
        likes: admin.firestore.FieldValue.arrayUnion(userId),
        likesCount: admin.firestore.FieldValue.increment(1),
      });
    }

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const dislikeComment = async (req, res) => {
  const { id: commentId } = req.params;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return error(res, messages.COMMENT_NOT_FOUND, [], 404);
    }

    const comment = commentDoc.data();
    const userId = req.user?.uid;

    if (comment.dislikes.includes(userId)) {
      // Undo dislike
      await commentRef.update({
        dislikes: admin.firestore.FieldValue.arrayRemove(userId),
        dislikesCount: admin.firestore.FieldValue.increment(-1),
      });
    } else {
      // Dislike the comment
      await commentRef.update({
        dislikes: admin.firestore.FieldValue.arrayUnion(userId),
        dislikesCount: admin.firestore.FieldValue.increment(1),
      });
    }

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