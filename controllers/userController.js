const db = require('../db/init');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');

const trendingUserList = async (req, res) => {
  try {
    const { email } = req.query;
    const userSnapshot = await db.collection('users').where('email', '!=', email).limit(10).get();

    const users = [];
    userSnapshot.forEach((doc) => {
      const { name } = doc.data();
      users.push({ id: doc.id, name });
    });

    return success(res, users, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  trendingUserList
};