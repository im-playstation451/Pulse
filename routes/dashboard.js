const express = require('express');
const router = express.Router();
const { readUsers, writeUsers, readGroupChats, writeGroupChats } = require('../utils/user');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', async (req, res) => {
  const message = req.session.message;
  delete req.session.message;
  const allUsers = await readUsers();
  const allGroupChats = await readGroupChats();
  let currentUserData = allUsers.find(u => u.id === req.session.user.id);

  if (!currentUserData.groupChats) {
    currentUserData.groupChats = [];
  }

  const userGroupChatDetails = allGroupChats.filter(gc => currentUserData.groupChats.includes(gc.id));

  req.session.user = currentUserData;

  res.render('dashboard', { user: req.session.user, message: message, users: allUsers, groupChats: userGroupChatDetails });
});

router.get('/dashboard', (req, res) => {
  res.render('parts/sidebar', { currentPath: req.path });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

router.post('/add-friend', async (req, res) => {
  const { friendUsername } = req.body;
  const currentUser = req.session.user;

  if (!friendUsername) {
    req.session.message = { type: 'error', text: 'Friend username cannot be empty.' };
    return res.redirect('/dashboard');
  }

  if (friendUsername === currentUser.username) {
    req.session.message = { type: 'error', text: 'You cannot send a friend request to yourself.' };
    return res.redirect('/dashboard');
  }

  let users = await readUsers();
  const targetFriend = users.find(u => u.username === friendUsername);

  if (!targetFriend) {
    req.session.message = { type: 'error', text: 'User not found.' };
    return res.redirect('/dashboard');
  }

  const currentUserIndex = users.findIndex(u => u.id === currentUser.id);
  const targetFriendIndex = users.findIndex(u => u.id === targetFriend.id);

  if (!users[currentUserIndex.friends]) users[currentUserIndex].friends = [];
  if (!users[currentUserIndex].sentFriendRequests) users[currentUserIndex].sentFriendRequests = [];
  if (!users[currentUserIndex].receivedFriendRequests) users[currentUserIndex].receivedFriendRequests = [];

  if (!users[targetFriendIndex].friends) users[targetFriendIndex].friends = [];
  if (!users[targetFriendIndex].sentFriendRequests) users[targetFriendIndex].sentFriendRequests = [];
  if (!users[targetFriendIndex].receivedFriendRequests) users[targetFriendIndex].receivedFriendRequests = [];

  if (users[currentUserIndex].friends.includes(targetFriend.username)) {
    req.session.message = { type: 'warning', text: `${friendUsername} is already your friend.` };
    return res.redirect('/dashboard');
  }

  if (users[currentUserIndex].sentFriendRequests.includes(targetFriend.username)) {
    req.session.message = { type: 'warning', text: `You have already sent a friend request to ${friendUsername}.` };
    return res.redirect('/dashboard');
  }

  if (users[currentUserIndex].receivedFriendRequests.includes(targetFriend.username)) {
    req.session.message = { type: 'info', text: `${friendUsername} has already sent you a friend request. You can accept it below!` };
    return res.redirect('/dashboard');
  }

  users[currentUserIndex].sentFriendRequests.push(targetFriend.username);
  users[targetFriendIndex].receivedFriendRequests.push(currentUser.username);

  writeUsers(users);

  req.session.user = users.find(u => u.id === currentUser.id);

  req.app.get('io').to(targetFriend.id).emit('newFriendRequest', {
    from: currentUser.username,
    fromId: currentUser.id
  });

  req.session.message = { type: 'success', text: `Friend request sent to ${friendUsername}.` };
  res.redirect('/dashboard');
});

router.post('/accept-friend-request', async (req, res) => {
  const { requesterUsername } = req.body;
  const currentUser = req.session.user;

  let users = await readUsers();
  const currentUserIndex = users.findIndex(u => u.id === currentUser.id);
  const requesterIndex = users.findIndex(u => u.username === requesterUsername);

  if (currentUserIndex === -1 || requesterIndex === -1) {
    req.session.message = { type: 'error', text: 'An error occurred. User not found.' };
    return res.redirect('/dashboard');
  }

  if (!users[currentUserIndex].friends) users[currentUserIndex].friends = [];
  if (!users[currentUserIndex].receivedFriendRequests) users[currentUserIndex].receivedFriendRequests = [];
  if (!users[requesterIndex].friends) users[requesterIndex].friends = [];
  if (!users[requesterIndex].sentFriendRequests) users[requesterIndex].sentFriendRequests = [];

  const receivedRequestIndex = users[currentUserIndex].receivedFriendRequests.indexOf(requesterUsername);
  if (receivedRequestIndex === -1) {
    req.session.message = { type: 'error', text: `No friend request from ${requesterUsername} found.` };
    return res.redirect('/dashboard');
  }

  users[currentUserIndex].receivedFriendRequests.splice(receivedRequestIndex, 1);
  const sentRequestIndex = users[requesterIndex].sentFriendRequests.indexOf(currentUser.username);
  if (sentRequestIndex !== -1) {
    users[requesterIndex].sentFriendRequests.splice(sentRequestIndex, 1);
  }

  users[currentUserIndex].friends.push(requesterUsername);
  users[requesterIndex].friends.push(currentUser.username);

  writeUsers(users);

  req.session.user = users.find(u => u.id === currentUser.id);

  req.app.get('io').to(users[requesterIndex].id).emit('friendRequestAccepted', {
    accepterUsername: currentUser.username,
    accepterId: currentUser.id
  });

  req.session.message = { type: 'success', text: `You are now friends with ${requesterUsername}!` };
  res.redirect('/dashboard');
});

router.post('/reject-friend-request', async (req, res) => {
  const { requesterUsername } = req.body;
  const currentUser = req.session.user;

  let users = await readUsers();
  const currentUserIndex = users.findIndex(u => u.id === currentUser.id);
  const requesterIndex = users.findIndex(u => u.username === requesterUsername);

  if (currentUserIndex === -1 || requesterIndex === -1) {
    req.session.message = { type: 'error', text: 'An error occurred. User not found.' };
    return res.redirect('/dashboard');
  }

  if (!users[currentUserIndex].receivedFriendRequests) users[currentUserIndex].receivedFriendRequests = [];
  if (!users[requesterIndex].sentFriendRequests) users[requesterIndex].sentFriendRequests = [];

  const receivedRequestIndex = users[currentUserIndex].receivedFriendRequests.indexOf(requesterUsername);
  if (receivedRequestIndex === -1) {
    req.session.message = { type: 'error', text: `No friend request from ${requesterUsername} found to reject.` };
    return res.redirect('/dashboard');
  }

  users[currentUserIndex].receivedFriendRequests.splice(receivedRequestIndex, 1);
  const sentRequestIndex = users[requesterIndex].sentFriendRequests.indexOf(currentUser.username);
  if (sentRequestIndex !== -1) {
    users[requesterIndex].sentFriendRequests.splice(sentRequestIndex, 1);
  }

  writeUsers(users);

  req.session.user = users.find(u => u.id === currentUser.id);

  req.session.message = { type: 'info', text: `Friend request from ${requesterUsername} rejected.` };
  res.redirect('/dashboard');
});

router.post('/unfriend', async (req, res) => {
  const { friendUsername } = req.body;
  const currentUser = req.session.user;

  let users = await readUsers();
  const currentUserIndex = users.findIndex(u => u.id === currentUser.id);
  const friendIndex = users.findIndex(u => u.username === friendUsername);

  if (currentUserIndex === -1 || friendIndex === -1) {
    req.session.message = { type: 'error', text: 'An error occurred. User not found.' };
    return res.redirect('/dashboard');
  }

  if (!users[currentUserIndex].friends) users[currentUserIndex].friends = [];
  if (!users[friendIndex].friends) users[friendIndex].friends = [];

  const currentUserFriendIndex = users[currentUserIndex].friends.indexOf(friendUsername);
  const friendUserFriendIndex = users[friendIndex].friends.indexOf(currentUser.username);

  if (currentUserFriendIndex === -1) {
    req.session.message = { type: 'error', text: `${friendUsername} is not your friend.` };
    return res.redirect('/dashboard');
  }

  users[currentUserIndex].friends.splice(currentUserFriendIndex, 1);
  users[friendIndex].friends.splice(friendUserFriendIndex, 1);

  writeUsers(users);

  req.session.user = users.find(u => u.id === currentUser.id);

  req.app.get('io').to(users[friendIndex].id).emit('unfriended', {
    unfrienderUsername: currentUser.username,
    unfrienderId: currentUser.id
  });

  req.session.message = { type: 'info', text: `You are no longer friends with ${friendUsername}.` };
  res.redirect('/dashboard');
});

router.post('/create-group-chat', async (req, res) => {
  const { groupName, participants } = req.body;
  const currentUser = req.session.user;

  if (!groupName || !participants || participants.length === 0) {
    return res.status(400).json({ message: 'Group name and at least one participant are required.' });
  }

  let allUsers = await readUsers();
  let allGroupChats = await readGroupChats();

  const participantUsernames = Array.isArray(participants) ? participants : [participants];

  const validFriends = currentUser.friends || [];
  const invalidParticipants = participantUsernames.filter(username => !validFriends.includes(username));

  if (invalidParticipants.length > 0) {
    return res.status(400).json({ message: `Invalid participants: ${invalidParticipants.join(', ')}. Only friends can be added.` });
  }

  const allParticipantUsernames = [...new Set([...participantUsernames, currentUser.username])];
  const participantIds = allParticipantUsernames.map(username => {
    const user = allUsers.find(u => u.username === username);
    return user ? user.id : null;
  }).filter(id => id !== null);

  if (participantIds.length < 2) {
    return res.status(400).json({ message: 'Group chat must have at least two members (including yourself).' });
  }

  const groupId = `gc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const newGroupChat = {
    id: groupId,
    name: groupName,
    participants: participantIds,
    creatorId: currentUser.id,
    createdAt: new Date().toISOString(),
    messages: [] 
  };

  allGroupChats.push(newGroupChat);
  await writeGroupChats(allGroupChats);

  for (const pId of participantIds) {
    const userIndex = allUsers.findIndex(u => u.id === pId);
    if (userIndex !== -1) {
      if (!allUsers[userIndex].groupChats) {
        allUsers[userIndex].groupChats = [];
      }
      allUsers[userIndex].groupChats.push(groupId);
    }
  }

  await writeUsers(allUsers);

  req.session.user = allUsers.find(u => u.id === currentUser.id);

  const io = req.app.get('io');
  participantIds.forEach(pId => {
    io.to(pId).emit('newGroupChat', { groupId: groupId, groupName: groupName });
  });

  return res.status(201).json({ message: 'Group chat created successfully', groupId: groupId });
});

router.post('/gc/:groupId/add-members', async (req, res) => {
  const { groupId } = req.params;
  const { participants } = req.body; 
  const currentUser = req.session.user;

  if (!groupId || !participants || participants.length === 0) {
    return res.status(400).json({ message: 'Group ID and at least one participant are required.' });
  }

  let allUsers = await readUsers();
  let allGroupChats = await readGroupChats();

  const groupChatIndex = allGroupChats.findIndex(gc => gc.id === groupId);
  if (groupChatIndex === -1) {
    return res.status(404).json({ message: 'Group chat not found.' });
  }

  const groupChat = allGroupChats[groupChatIndex];

  if (!groupChat.participants.includes(currentUser.id)) {
    return res.status(403).json({ message: 'You are not a member of this group chat.' });
  }

  const participantUsernames = Array.isArray(participants) ? participants : [participants];
  const validFriends = currentUser.friends || [];

  const invalidFriends = participantUsernames.filter(username => !validFriends.includes(username));
  if (invalidFriends.length > 0) {
    return res.status(400).json({ message: `Invalid participants: ${invalidFriends.join(', ')}. Only friends can be added.` });
  }

  const newParticipantIds = [];
  const existingParticipantUsernames = [];
  
  for (const username of participantUsernames) {
    const user = allUsers.find(u => u.username === username);
    if (user) {
      if (groupChat.participants.includes(user.id)) {
        existingParticipantUsernames.push(username);
      } else {
        newParticipantIds.push(user.id);
      }
    }
  }

  if (newParticipantIds.length === 0) {
    let message = 'No new members were added.';
    if (existingParticipantUsernames.length > 0) {
      message += ` The following users are already members: ${existingParticipantUsernames.join(', ')}.`;
    }
    return res.status(400).json({ message: message });
  }

  groupChat.participants.push(...newParticipantIds);
  await writeGroupChats(allGroupChats);

  for (const pId of newParticipantIds) {
    const userIndex = allUsers.findIndex(u => u.id === pId);
    if (userIndex !== -1) {
      if (!allUsers[userIndex].groupChats) {
        allUsers[userIndex].groupChats = [];
      }
      allUsers[userIndex].groupChats.push(groupId);
    }
  }
  await writeUsers(allUsers);

  const io = req.app.get('io');
  const newParticipants = newParticipantIds.map(id => allUsers.find(u => u.id === id).username);
  
  groupChat.participants.forEach(pId => {
    io.to(pId).emit('groupChatMembersAdded', {
      groupId: groupId,
      newMembers: newParticipants,
      groupName: groupChat.name
    });
  });

  return res.status(200).json({ message: `${newParticipantIds.length} members added successfully.`, newMembers: newParticipants });
});

router.post('/gc/leave/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const currentUser = req.session.user;

  let allUsers = await readUsers();
  let allGroupChats = await readGroupChats();

  const groupChatIndex = allGroupChats.findIndex(gc => gc.id === groupId);
  if (groupChatIndex === -1) {
    return res.status(404).json({ message: 'Group chat not found.' });
  }

  const groupChat = allGroupChats[groupChatIndex];

  const participantIndex = groupChat.participants.indexOf(currentUser.id);
  if (participantIndex === -1) {
    return res.status(400).json({ message: 'You are not a member of this group chat.' });
  }
  groupChat.participants.splice(participantIndex, 1);

  await writeGroupChats(allGroupChats);

  const currentUserIndex = allUsers.findIndex(u => u.id === currentUser.id);
  if (currentUserIndex !== -1 && allUsers[currentUserIndex].groupChats) {
    const gcIndex = allUsers[currentUserIndex].groupChats.indexOf(groupId);
    if (gcIndex !== -1) {
      allUsers[currentUserIndex].groupChats.splice(gcIndex, 1);
    }
  }
  await writeUsers(allUsers);

  req.session.user = allUsers.find(u => u.id === currentUser.id);

  const io = req.app.get('io');
  groupChat.participants.forEach(pId => {
    io.to(pId).emit('groupChatMemberLeft', {
      groupId: groupId,
      memberId: currentUser.id,
      memberName: currentUser.username,
      groupName: groupChat.name
    });
  });

  io.to(currentUser.id).emit('groupChatLeft', { groupId: groupId });

  return res.status(200).json({ message: 'Successfully left group chat.' });
});

router.post('/gc/picture/:groupId', upload.single('picture'), async (req, res) => {
  const { groupId } = req.params;
  const currentUser = req.session.user;

  if (!req.file) {
    return res.status(400).json({ message: 'No picture file provided.' });
  }

  let allGroupChats = await readGroupChats();
  const groupChatIndex = allGroupChats.findIndex(gc => gc.id === groupId);

  if (groupChatIndex === -1) {
    return res.status(404).json({ message: 'Group chat not found.' });
  }

  const groupChat = allGroupChats[groupChatIndex];

  if (!groupChat.participants.includes(currentUser.id)) {
    return res.status(403).json({ message: 'You are not authorized to change this group chat picture.' });
  }

  try {
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('folder', 'image'); 
    formData.append('filename', `${groupId}-${Date.now()}${path.extname(req.file.originalname)}`);

    const cdnBaseUrl = process.env.CDN_BASE_URL;
    const cdnAuthToken = process.env.CDN_AUTH_TOKEN;

    const cdnResponse = await axios.post(`${cdnBaseUrl}/upload`, formData, {
      headers: {
        'Authorization': cdnAuthToken,
        ...formData.getHeaders()
      }
    });

    const newPictureUrl = cdnResponse.data.fileUrl;

    if (!newPictureUrl) {
      throw new Error('CDN upload failed: missing fileUrl in response.');
    }

    const baseUrl = cdnBaseUrl.endsWith('/') ? cdnBaseUrl.slice(0, -1) : cdnBaseUrl;
    const pictureUrl = newPictureUrl.startsWith('/') ? newPictureUrl : '/' + newPictureUrl;
    groupChat.picture = baseUrl + pictureUrl;
    await writeGroupChats(allGroupChats);

    const io = req.app.get('io');
    groupChat.participants.forEach(pId => {
      io.to(pId).emit('groupChatPictureUpdated', {
        groupId: groupId,
        newPictureUrl: groupChat.picture
      });
    });

    return res.status(200).json({ message: 'Group chat picture updated successfully.', pictureUrl: groupChat.picture });

  } catch (error) {
    console.error('Error updating group chat picture:', error.message);
    
    if (error.response) {
      console.error('CDN Error Response:', error.response.data);
      return res.status(500).json({ message: `CDN upload failed: ${error.response.data.error || 'Unknown CDN error'}` });
    }
    return res.status(500).json({ message: 'Failed to update group chat picture due to a server error.' });
  }
});
router.post('/gc/name/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { name } = req.body;
  const currentUser = req.session.user;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: 'Group chat name cannot be empty.' });
  }

  let allGroupChats = await readGroupChats();
  const groupChatIndex = allGroupChats.findIndex(gc => gc.id === groupId);

  if (groupChatIndex === -1) {
    return res.status(404).json({ message: 'Group chat not found.' });
  }

  const groupChat = allGroupChats[groupChatIndex];

  if (!groupChat.participants.includes(currentUser.id)) {
    return res.status(403).json({ message: 'You are not authorized to change this group chat name.' });
  }

  groupChat.name = name.trim();
  await writeGroupChats(allGroupChats);

  const io = req.app.get('io');
  groupChat.participants.forEach(pId => {
    io.to(pId).emit('groupChatNameUpdated', {
      groupId: groupId,
      newName: groupChat.name
    });
  });

  return res.status(200).json({ message: 'Group chat name updated successfully.', newName: groupChat.name });
});
module.exports = router;