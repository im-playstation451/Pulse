const express = require('express');
const app = express();
const port = 3000;
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

let users = [];
try {
  const data = fs.readFileSync('users.json', 'utf8');
  users = JSON.parse(data);
} catch (err) {
  console.error("Error reading user data:", err);
}

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

app.post('/register', async (req, res) => {
  try {
    const { email, username, password, repeatPassword } = req.body;
    
    if (password !== repeatPassword) {
      return res.render('register', { error: 'Passwords do not match' });

    }

    if (users.some(user => user.email === email)) {
      return res.status(400).render('register', { error: 'Email already registered' });
    }

    if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).render('register', { error: 'Username is already taken' });
    }

    const id = generateID();

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    users.push({ id, email, username, password: hashedPassword });
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    res.redirect('/login');
  } catch (error) {
    console.error("Registration Error:", error);
    res.render(500).send("Registration failed. Try again.");
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email: usernameOrEmail, password } = req.body;

    const user = users.find(user => 
      user.email === usernameOrEmail || 
      user.username === usernameOrEmail
    );

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
    res.status(500).render('login', { error: "Login failed. Try again." });
  }
});

app.get('/login', (req, res) => {
  res.render('login');
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