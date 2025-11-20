const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { db, User, Project, Task } = require('./database/setup');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Session middleware
app.use(session({
    secret: 'your-secret-key', // change to something secure
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using HTTPS
}));

// Test database connection
async function testConnection() {
    try {
        await db.authenticate();
        console.log('Connection to database established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}
testConnection();

// --- AUTHENTICATION MIDDLEWARE ---
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
}

// --- TEST ENDPOINT ---
app.post('/api/test', (req, res) => {
    console.log('Received body:', req.body);
    res.json({ received: req.body });
});

// --- AUTH ROUTES ---

// REGISTER
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'username, email, and password are required' });
    }

    try {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, email, password: hashedPassword });

        res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ message: 'email and password are required' });
    }

    try {
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(401).json({ message: 'Invalid email or password' });

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ message: 'Invalid email or password' });

        req.session.user = { id: user.id, username: user.username, email: user.email };
        res.json({ message: 'Login successful' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// LOGOUT
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Logout failed' });
        res.json({ message: 'Logout successful' });
    });
});

// --- PROJECT ROUTES ---
// Get all projects for logged-in user
app.get('/api/projects', isAuthenticated, async (req, res) => {
    try {
        const projects = await Project.findAll({ where: { userId: req.user.id } });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// Get project by ID
app.get('/api/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const project = await Project.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!project) return res.status(404).json({ error: 'Project not found' });
        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// Create project
app.post('/api/projects', isAuthenticated, async (req, res) => {
    const { name, description, status, dueDate } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Project name is required' });

    try {
        const newProject = await Project.create({ name, description, status, dueDate, userId: req.user.id });
        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Update project
app.put('/api/projects/:id', isAuthenticated, async (req, res) => {
    const { name, description, status, dueDate } = req.body || {};
    try {
        const [updatedRowsCount] = await Project.update(
            { name, description, status, dueDate },
            { where: { id: req.params.id, userId: req.user.id } }
        );
        if (updatedRowsCount === 0) return res.status(404).json({ error: 'Project not found' });

        const updatedProject = await Project.findByPk(req.params.id);
        res.json(updatedProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Delete project
app.delete('/api/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const deletedRowsCount = await Project.destroy({ where: { id: req.params.id, userId: req.user.id } });
        if (deletedRowsCount === 0) return res.status(404).json({ error: 'Project not found' });
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port http://localhost:${PORT}`);
});
