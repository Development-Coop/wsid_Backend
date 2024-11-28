const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const subscribeUser = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if the email already exists in the subscriptions collection
    const existingUser = await db.collection('subscriptions')
      .where('email', '==', email)
      .get();

    if (!existingUser.empty) {
      // If the email already exists, return a response
      return error(res, messages.ALREADY_SUBSCRIBED, [], 409); // 409 Conflict
    }

    // Add new subscription
    await db.collection('subscriptions').add({
      email,
      createdAt: new Date(),
    });

    return success(res, [], messages.SUBSCRITION_SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  subscribeUser
};
