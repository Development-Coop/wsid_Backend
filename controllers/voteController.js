const db = require('../db/init');
const admin = require('firebase-admin');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const castVote = async (req, res) => {
  const { postId, optionId } = req.body;

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

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    console.error("Error casting vote:", err.message);
    return error(res, err.message, [], 500);
  }
};

const deleteVote = async (req, res) => {
  const { postId, optionId } = req.body;

  try {
    // Check if the vote exists in the database
    const voteQuerySnapshot = await db
      .collection('votes')
      .where('postId', '==', postId)
      .where('optionId', '==', optionId)
      .where('userId', '==', req.user?.uid) 
      .get();

    if (voteQuerySnapshot.empty) {
      return error(res, messages.VOTE_NOT_FOUND, [], 404);
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

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    console.error("Error deleting vote:", err.message);
    return error(res, err.message, [], 500);
  }
};

module.exports = {
  castVote,
  deleteVote
};