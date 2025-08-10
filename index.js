const express = require('express');
const app = express();
const port = 3000;
const bodyParser = require('body-parser');
const session = require('express-session');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

let users = [];

function generateID() {
  let id = '';
  for (let i = 0; i < 15; i++) {
    id += Math.floor(Math.random() * 10);
  }
  return id;
}

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', (req, res) => {
  const { email, username, password, repeatPassword } = req.body;
  
  if (password !== repeatPassword) {
    return res.status(400).send('Passwords do not match');
  }
  
  if (users.some(user => user.email === email)) {
    return res.status(400).send('Email already registered');
  }
  
  if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).send('Username is already taken');
  }
  
  const id = generateID();
  users.push({ id, email, username, password });
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(user => user.email === email);
  
  if (!user) {
    return res.status(400).send('User not found');
  }
  
  if (user.password !== password) {
    return res.status(400).send('Incorrect password');
  }
  
  req.session.user = user;
  res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('dashboard', { user: req.session.user });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.listen(port, () => {
  console.log(`Port ${port} is pulsing alive`);
});