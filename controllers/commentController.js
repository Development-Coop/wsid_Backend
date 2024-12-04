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
      likesCount: 0,
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

const likeComment = async (req, res) => {
  const { id: commentId } = req.params;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    await commentRef.update({
      likes: admin.firestore.FieldValue.arrayUnion(req.user?.uid),
      likesCount: admin.firestore.FieldValue.increment(1),
    });

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const unlikeComment = async (req, res) => {
  const { id: commentId } = req.params;

  try {
    const commentRef = db.collection('comments').doc(commentId);
    await commentRef.update({
      likes: admin.firestore.FieldValue.arrayRemove(req.user?.uid),
      likesCount: admin.firestore.FieldValue.increment(-1),
    });

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  createComment,
  updateComment,
  deleteComment,
  likeComment,
  unlikeComment
};