const db = require('../db/init');
const bcrypt = require('bcryptjs');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase } = require('../helper/firebase_storage');

const trendingUserList = async (req, res) => {
  try {
    const { email } = req.user;
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

const editProfile = async (req, res) => {
  const { name, dateOfBirth, password, username, bio } = req.body;
  const profilePic = req.file;

  try {
    const { uid } = req.user;

    // Fetch the current user document from Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    // Prepare updated data
    let updatedData = {
      name: name || userDoc.data().name,
      dateOfBirth: dateOfBirth || userDoc.data().dateOfBirth,
      username: username || userDoc.data().username,
      bio: bio || userDoc.data().bio,
    };

    // Handle profile picture update
    if (profilePic) {
      const profilePicUrl = await uploadFileToFirebase(profilePic);
      updatedData.profilePicUrl = profilePicUrl;
    }

    // Handle password update
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updatedData.password = hashedPassword;
    }

    // Check if the new username is unique (if provided)
    if (username && username !== userDoc.data().username) {
      const existingUserSnapshot = await db.collection('users').where('username', '==', username).get();
      if (!existingUserSnapshot.empty) {
        return error(res, messages.USERNAME_EXIST, [], 500);
      }
    }

    // Update the user document in Firestore
    await db.collection('users').doc(uid).update(updatedData);

    return success(res, {}, messages.SUCCESS);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const viewProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    // Fetch the user's profile details
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    const userData = userDoc.data();
    const createdAt = new Date(userData.createdAt._seconds * 1000 + userData.createdAt._nanoseconds / 1000000).toISOString();

    // Fetch the count of likes on this user's profile
    //const likeSnapshot = await db.collection('likes')
    //  .where('targetUserId', '==', userId)
    //  .get();
    //const likesCount = likeSnapshot.size;

    // Fetch the count of followers
    //const followersSnapshot = await db.collection('followers')
    //  .where('followingId', '==', userId)
    //  .get();
    //const followersCount = followersSnapshot.size;

    // Fetch the count of following (people the user is following)
    //const followingSnapshot = await db.collection('followers')
    //  .where('followerId', '==', userId)
    //  .get();
    //const followingCount = followingSnapshot.size;

    // Return the profile details along with likes, followers, and following count
    data = {
      user: {
        id: userDoc.id,
        name: userData.name,
        email: userDoc.email,
        dateOfBirth: userData.dateOfBirth,
        username: userData.username,
        profilePic: userData.profilePicUrl,
        bio: userData.bio,
        createdAt,
      },
      //likesCount,
      //followersCount,
      //followingCount,
    }
    return success(res, data, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  trendingUserList,
  editProfile,
  viewProfile
};