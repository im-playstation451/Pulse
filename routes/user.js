const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { readUsers, writeUsers } = require('../utils/user');
const authGuestMiddleware = require('../middleware/auth-guest');

router.get('/', authGuestMiddleware, (req, res) => {
  res.render('home');
});

router.get('/login', authGuestMiddleware, (req, res) => {
  res.render('login');
});

router.get('/register', authGuestMiddleware, (req, res) => {
  res.render('register');
});

router.post('/register', async (req, res) => {
  try {
    const { email, username, password, repeatPassword } = req.body;

    if (password !== repeatPassword) {
      return res.render('register', { error: 'Passwords do not match' });
    }

    const users = readUsers();

    if (users.some(user => user.email === email)) {
      return res.status(400).render('register', { error: 'Email already registered' });
    }

    if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).render('register', { error: 'Username is already taken' });
    }

    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const hashedPassword = await bcrypt.hash(password, 10);

    users.push({ id, email, username, password: hashedPassword });
    writeUsers(users);

    res.redirect('/login');

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).render('register', { error: 'Registration failed. Try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readUsers();
    const user = users.find(user => user.email === email);

    if (!user) {
      return res.status(400).render('login', { error: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).render('login', { error: 'Incorrect password' });
    }

    req.session.user = user;
    res.redirect('/dashboard');

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).render('login', { error: 'Login failed. Try again.' });
  }
});

module.exports = router;