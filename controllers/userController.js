const db = require('../db/init');
const bcrypt = require('bcryptjs');
const messages = require('../constants/messages');
const { success, error } = require('../model/response');
const { uploadFileToFirebase, deleteFileFromFirebase } = require('../helper/firebase_storage');
const admin = require('firebase-admin');

const usersList = async (req, res) => {
  try {
    if (!req.user) {
      return error(res, 'User not authenticated', [], 401);
    }
    
    const { email, role } = req.user;
    
    if (!email) {
      return error(res, 'User email not found', [], 400);
    }
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc', search } = req.query;

    const limitValue = parseInt(limit, 10);
    const pageValue = parseInt(page, 10);

    // Calculate the starting point for pagination
    const offset = (pageValue - 1) * limitValue;

    // Base query excluding the current user
    let baseQuery = db.collection('users').where('email', '!=', email);

    // Apply the status filter conditionally
    if (role === 'user') {
      baseQuery = baseQuery.where('status', '==', true);
    }

    // If a search query is provided, fetch matching users by name, email, or username
    let searchResults = [];
    let totalUsers = 0;
    if (search) {
      const searchPromises = [
        baseQuery.where('name', '>=', search).where('name', '<=', search + '\uf8ff').get(),
        baseQuery.where('email', '>=', search).where('email', '<=', search + '\uf8ff').get(),
        baseQuery.where('username', '>=', search).where('username', '<=', search + '\uf8ff').get(),
      ];

      const snapshots = await Promise.all(searchPromises);
      snapshots.forEach((snapshot) => {
        snapshot.forEach((doc) => {
          const userData = doc.data();
          if (!searchResults.some((user) => user.id === doc.id)) {
            searchResults.push({ id: doc.id, ...userData });
          }
        });
      });

      // Sort results based on `sortBy` and `order`
      searchResults.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        if (order === 'asc') return aValue > bValue ? 1 : -1;
        return aValue < bValue ? 1 : -1;
      });
      totalUsers = searchResults.length;
    } else {
      const totalUsersSnapshot = await baseQuery.get();
      totalUsers = totalUsersSnapshot.size;

      // No search filter; fetch paginated users
      const userSnapshot = await baseQuery
        .orderBy(sortBy, order)
        .offset(offset)
        .limit(limitValue)
        .get();

      userSnapshot.forEach((doc) => {
        searchResults.push({ id: doc.id, ...doc.data() });
      });
    }

    // Calculate pagination details
    const totalPages = Math.ceil(totalUsers / limitValue);
    const paginatedResults = search ? searchResults.slice(offset, offset + limitValue) : searchResults;

    return success(
      res,
      {
        users: paginatedResults.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt?.toDate() || null,
          ...(role === 'admin' ? { status: user.status } : {}),
        })),
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
    const userSnapshot = await db.collection('users')
    .where('email', '!=', email)
    .where('status', '==', true)
    .limit(10)
    .get();

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
    const userData = userDoc.data();
    let updatedData = {
      name: name || userData.name,
      dateOfBirth: dateOfBirth || userData.dateOfBirth,
      username: username || userData.username,
      bio: bio || userData.bio,
    };

    // Variables to store old file URLs
    let oldProfilePicUrl = userData.profilePicUrl || null;
    let oldCoverPicUrl = userData.coverPicUrl || null;

    // Handle profile picture update
    if (files && files.length > 0) {
      const profilePic = files.filter(file => file.fieldname === 'profilePic');
      if (profilePic.length > 0) {
        const profilePicUrl = await uploadFileToFirebase('user', profilePic[0]);
        updatedData.profilePicUrl = profilePicUrl;

        // Delete old profile picture
        if (oldProfilePicUrl) {
          await deleteFileFromFirebase(oldProfilePicUrl);
        }
      }

      const coverPic = files.filter(file => file.fieldname === 'coverPic');
      if (coverPic.length > 0) {
        const coverPicUrl = await uploadFileToFirebase('user', coverPic[0]);
        updatedData.coverPicUrl = coverPicUrl;

        // Delete old cover picture
        if (oldCoverPicUrl) {
          await deleteFileFromFirebase(oldCoverPicUrl);
        }
      }
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
  const loggedInUserId = req.user.uid;
  try {
    // Fetch the user's profile details
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    const userData = userDoc.data();
    // Check if the user has an active status
    if (!userData.status && req.user.role === 'user') {
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }
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
        email: userData.email,
        dateOfBirth: userData.dateOfBirth,
        username: userData.username,
        profilePic: userData.profilePicUrl,
        coverPic: userData.coverPicUrl,
        bio: userData.bio,
        createdAt,
      },
      likesCount,
      followersCount,
      followingCount
    }

    // Add the status field if the role is "admin"
    if (req.user.role === "admin") {
      data.user.status = userData.status;
    }

    if(req.query.uid){
      // Check if the logged-in user has liked this profile
      const hasLikedSnapshot = await db.collection('likes')
        .where('targetUserId', '==', uid)
        .where('userId', '==', loggedInUserId)
        .get();
        data.hasLiked = !hasLikedSnapshot.empty;

      // Check if the logged-in user is following this profile
      const isFollowingSnapshot = await db.collection('followers')
        .where('followingId', '==', uid)
        .where('followerId', '==', loggedInUserId)
        .get();
      data.isFollowing = !isFollowingSnapshot.empty;
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

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const loggedInUserId = req.user.uid;

    // Ensure query is provided and has a length of at least 3
    if (!query || query.length < 3) {
      return error(res, "Search query must be at least 3 characters long", [], 400);
    }

    // Perform Firestore queries
    const nameQuery = db.collection('users').where('name', '>=', query).where('name', '<=', query + '\uf8ff').limit(20);
    const usernameQuery = db.collection('users').where('username', '>=', query).where('username', '<=', query + '\uf8ff').limit(20);
    const emailQuery = db.collection('users').where('email', '>=', query).where('email', '<=', query + '\uf8ff').limit(20);

    // Fetch results
    const [nameSnapshot, usernameSnapshot, emailSnapshot] = await Promise.all([
      nameQuery.get(),
      usernameQuery.get(),
      emailQuery.get(),
    ]);

    // Combine and deduplicate results
    const usersMap = new Map();
    const processSnapshot = (snapshot) => {
      snapshot.forEach((doc) => {
        const userData = doc.data();
        usersMap.set(doc.id, {
          id: doc.id,
          name: userData.name,
          profilePicUrl: userData.profilePicUrl || null,
        });
      });
    };

    processSnapshot(nameSnapshot);
    processSnapshot(usernameSnapshot);
    processSnapshot(emailSnapshot);

    // Convert Map values to an array
    const users = Array.from(usersMap.values());

    for (const user of users) {
      // Check if the logged-in user is following this user
      const isFollowingSnapshot = await db.collection('followers')
        .where('followingId', '==', user.id)
        .where('followerId', '==', loggedInUserId)
        .get();
      user.isFollowing = !isFollowingSnapshot.empty;
    }

    return success(res, users, messages.SUCCESS);
  } catch (err) {
    return error(res, err.message, [], 500);
  }
};

// User self-delete function - requires password confirmation
const userDelete = async (req, res) => {
  console.log('=== UserDelete Started ===');
  const { uid } = req.user; // Get user ID from authenticated request
  const { password } = req.body; // Require password confirmation for security
  
  try {
    console.log('User attempting to delete own account:', uid);
    
    // Step 1: Get user document from Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.log('User document not found in Firestore');
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }
    
    const userData = userDoc.data();
    console.log('User data retrieved for deletion');
    
    // Step 2: Verify password for security confirmation
    if (!userData.password) {
      console.log('No password found for user - cannot verify');
      return error(res, 'Cannot verify password for account deletion', [], 400);
    }
    
    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (!isPasswordValid) {
      console.log('Invalid password provided for account deletion');
      return error(res, 'Invalid password provided', [], 400);
    }
    
    console.log('Password validated, proceeding with account deletion...');

    // Step 3: Complete user deletion process
    await performCompleteUserDeletion(uid, userData);

    console.log('User self-deletion completed successfully');
    return success(res, [], 'Account deleted successfully');
    
  } catch (err) {
    console.error('=== UserDelete Error ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    // Handle specific Firebase Auth errors
    if (err.code === 'auth/user-not-found') {
      console.log('User not found in Firebase Auth, continuing cleanup...');
      try {
        // Still try to clean up Firestore data
        await db.collection('users').doc(uid).delete();
        console.log('Firestore cleanup completed');
        return success(res, [], 'Account deleted successfully');
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
        return error(res, 'Account deletion partially completed', [], 500);
      }
    }
    
    return error(res, err.message, [], 500);
  }
};

// Helper function to perform complete user deletion
const performCompleteUserDeletion = async (uid, userData) => {
  console.log('=== Starting complete user deletion process for UID:', uid);
  
  try {
    // Step 1: Delete user's files from Firebase Storage
    if (userData.profilePicUrl) {
      console.log('Deleting profile picture from Firebase Storage...');
      try {
        await deleteFileFromFirebase(userData.profilePicUrl);
        console.log('Profile picture deleted successfully');
      } catch (storageError) {
        console.error('Failed to delete profile picture:', storageError);
        // Continue with deletion even if profile picture deletion fails
      }
    }
    
    if (userData.coverPicUrl) {
      console.log('Deleting cover picture from Firebase Storage...');
      try {
        await deleteFileFromFirebase(userData.coverPicUrl);
        console.log('Cover picture deleted successfully');
      } catch (storageError) {
        console.error('Failed to delete cover picture:', storageError);
        // Continue with deletion even if cover picture deletion fails
      }
    }
    
    // Step 2: Delete all user-related data from Firestore collections using batch
    console.log('Deleting user data from Firestore...');
    const batch = db.batch();
    
    // Delete refresh tokens
    const refreshTokensQuery = await db.collection('refresh_tokens')
      .where('userId', '==', uid)
      .get();
    refreshTokensQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${refreshTokensQuery.size} refresh tokens to delete`);
    
    // Delete OTP verification records
    const otpQuery = await db.collection('otp_verifications')
      .where('email', '==', userData.email)
      .get();
    otpQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${otpQuery.size} OTP records to delete`);
    
    // Delete temp_users records
    const tempUsersQuery = await db.collection('temp_users')
      .where('email', '==', userData.email)
      .get();
    tempUsersQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${tempUsersQuery.size} temp user records to delete`);
    
    // Delete likes given by this user
    const likesGivenQuery = await db.collection('likes')
      .where('userId', '==', uid)
      .get();
    likesGivenQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${likesGivenQuery.size} likes given to delete`);
    
    // Delete likes received by this user
    const likesReceivedQuery = await db.collection('likes')
      .where('targetUserId', '==', uid)
      .get();
    likesReceivedQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${likesReceivedQuery.size} likes received to delete`);
    
    // Delete followers relationships (where user is following others)
    const followingQuery = await db.collection('followers')
      .where('followerId', '==', uid)
      .get();
    followingQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${followingQuery.size} following relationships to delete`);
    
    // Delete followers relationships (where others are following user)
    const followersQuery = await db.collection('followers')
      .where('followingId', '==', uid)
      .get();
    followersQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${followersQuery.size} follower relationships to delete`);
    
    // Delete user posts (if you have a posts collection)
    const postsQuery = await db.collection('posts')
      .where('userId', '==', uid)
      .get();
    postsQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${postsQuery.size} posts to delete`);
    
    // Delete user comments (if you have a comments collection)
    const commentsQuery = await db.collection('comments')
      .where('userId', '==', uid)
      .get();
    commentsQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });
    console.log(`Found ${commentsQuery.size} comments to delete`);
    
    // Delete the user document from Firestore
    batch.delete(db.collection('users').doc(uid));
    console.log('Added user document to batch delete');
    
    // Commit all Firestore deletions
    await batch.commit();
    console.log('Firestore cleanup completed - all data deleted in batch');
    
    // Step 3: Delete user from Firebase Authentication (do this last)
    console.log('Deleting user from Firebase Authentication...');
    await admin.auth().deleteUser(uid);
    console.log('Firebase Auth user deleted');
    
    console.log('Complete user deletion process finished successfully');
    return true;
    
  } catch (err) {
    console.error('Error in complete user deletion process:', err);
    throw err;
  }
};

// Admin delete function - performs hard delete
const adminDelete = async (req, res) => {
  console.log('=== AdminDelete Started ===');
  
  try {
    // Check if the user is an admin
    if (req.user.role !== 'admin') {
      console.log('Unauthorized: User is not an admin');
      return error(res, messages.UNAUTHORISED_ACCESS, [], 403);
    }

    const { uid } = req.query; // Get target user ID from query params
    
    if (!uid) {
      console.log('No user ID provided');
      return error(res, 'User ID is required', [], 400);
    }

    console.log('Admin attempting to delete user:', uid);

    // Fetch the target user's profile
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.log('Target user not found:', uid);
      return error(res, messages.USER_NOT_FOUND, [], 404);
    }

    const userData = userDoc.data();
    
    // Prevent admin from deleting other admins (optional business rule)
    if (userData.role === 'admin') {
      console.log('Cannot delete admin user');
      return error(res, 'Cannot delete admin users', [], 403);
    }

    // Perform complete user deletion using helper function
    await performCompleteUserDeletion(uid, userData);

    console.log('Admin deletion completed successfully');
    return success(res, {}, 'User deleted successfully');
    
  } catch (err) {
    console.error('=== AdminDelete Error ===');
    console.error('Error:', err);
    
    // Handle case where Firebase Auth user was already deleted
    if (err.code === 'auth/user-not-found') {
      console.log('User not found in Firebase Auth, but cleanup may have completed');
      return success(res, {}, 'User deleted successfully');
    }
    
    return error(res, err.message, [], 500);
  }
};

module.exports = { 
  usersList,
  trendingUserList,
  editProfile,
  viewProfile,
  likeProfile,
  followProfile,
  searchUsers,
  userDelete,
  adminDelete
};