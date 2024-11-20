const db = require('../db/init');
const bcrypt = require('bcryptjs');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase } = require('../helper/firebase_storage');

const usersList = async (req, res) => {
  try {
    const { email } = req.user;
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query; // Default values for pagination and sorting

    const limitValue = parseInt(limit, 10);
    const pageValue = parseInt(page, 10);

    // Calculate the starting point for pagination
    const offset = (pageValue - 1) * limitValue;

    // Fetch the total count of users excluding the current user
    const totalUsersSnapshot = await db
      .collection('users')
      .where('email', '!=', email)
      .get();
    const totalUsers = totalUsersSnapshot.size;

    // Calculate total pages
    const totalPages = Math.ceil(totalUsers / limitValue);

    // Fetch users with sorting, excluding the current user
    const userQuery = db
      .collection('users')
      .where('email', '!=', email)
      .orderBy(sortBy, order) // Sorting based on the query parameter
      .offset(offset)
      .limit(limitValue);

    const userSnapshot = await userQuery.get();

    if (userSnapshot.empty) {
      return success(
        res,
        {
          users: [],
          pagination: {
            currentPage: pageValue,
            totalPages,
            totalUsers,
            pageSize: limitValue,
          },
        },
        messages.NO_USERS_FOUND
      );
    }

    const users = [];
    userSnapshot.forEach((doc) => {
      const userData = doc.data();

      // Convert Firestore's timestamp to JavaScript Date object
      const createdAt = userData.createdAt ? userData.createdAt.toDate() : null;

      users.push({
        id: doc.id,
        name: userData.name,
        email: userData.email,
        createdAt,
      });
    });

    return success(
      res,
      {
        users,
        pagination: {
          currentPage: pageValue,
          totalPages,
          totalUsers,
          pageSize: limitValue,
        },
      },
      messages.SUCCESS
    );
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

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
  const files = req.files;

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
    if (files && files.length > 0) {
      const profilePicUrl = await uploadFileToFirebase('user', files[0]);
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
  const uid = req.query.uid || req.user.uid;
  try {
    // Fetch the user's profile details
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    const userData = userDoc.data();
    const createdAt = new Date(userData.createdAt._seconds * 1000 + userData.createdAt._nanoseconds / 1000000).toISOString();

    // Fetch the count of likes on this user's profile
    const likeSnapshot = await db.collection('likes')
      .where('targetUserId', '==', uid)
      .get();
    const likesCount = likeSnapshot.size;

    // Fetch the count of followers
    const followersSnapshot = await db.collection('followers')
      .where('followingId', '==', uid)
      .get();
    const followersCount = followersSnapshot.size;

    // Fetch the count of following (people the user is following)
    const followingSnapshot = await db.collection('followers')
      .where('followerId', '==', uid)
      .get();
    const followingCount = followingSnapshot.size;

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
      likesCount,
      followersCount,
      followingCount,
    }
    return success(res, data, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const likeProfile = async (req, res) => {
  const { targetUserId } = req.body;

  try {
    const { uid } = req.user;

    // Check if the target profile exists
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    // Check if the user has already liked the profile
    const likeSnapshot = await db.collection('likes')
      .where('userId', '==', uid)
      .where('targetUserId', '==', targetUserId)
      .get();

    if (likeSnapshot.empty) {
      // Like the profile
      await db.collection('likes').add({
        userId: uid,
        targetUserId,
        likedAt: new Date(),
      });
      return success(res, {}, messages.SUCCESS);
    } else {
      // Unlike the profile if already liked
      const likeDocId = likeSnapshot.docs[0].id;
      await db.collection('likes').doc(likeDocId).delete();
      return success(res, {}, messages.SUCCESS);
    }
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

const followProfile = async (req, res) => {
  const { targetUserId } = req.body;

  try {
    const { uid } = req.user;

    // Check if the target profile exists
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    // Check if the user is already following the profile
    const followSnapshot = await db.collection('followers')
      .where('followerId', '==', uid)
      .where('followingId', '==', targetUserId)
      .get();

    if (followSnapshot.empty) {
      // Follow the profile
      await db.collection('followers').add({
        followerId: uid,
        followingId: targetUserId,
        followedAt: new Date(),
      });
      return success(res, {}, messages.SUCCESS);
    } else {
      // Unfollow the profile if already following
      const followDocId = followSnapshot.docs[0].id;
      await db.collection('followers').doc(followDocId).delete();
      return success(res, {}, messages.SUCCESS);
    }
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  usersList,
  trendingUserList,
  editProfile,
  viewProfile,
  likeProfile,
  followProfile
};