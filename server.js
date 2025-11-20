// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { db, User, Project, Task } = require('./database/setup');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(session({
    secret: 'your-secret-key', // replace with a secure key in production
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // true if using HTTPS
}));

// --- Test database connection ---
async function testConnection() {
    try {
        await db.authenticate();
        console.log('Connection to database established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}
testConnection();

// --- Sanity check route ---
app.get('/test', (req, res) => {
    res.send('Server routes are working!');
});

// --- Authentication Middleware ---
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
}

// --- AUTH ROUTES ---

// REGISTER
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return res.status(400).json({ message: 'Email already in use' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, email, password: hashedPassword });

        res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

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
// GET all projects (only for logged-in user)
app.get('/api/projects', isAuthenticated, async (req, res) => {
    try {
        const projects = await Project.findAll({ where: { userId: req.user.id } });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// GET project by ID (must belong to user)
app.get('/api/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const project = await Project.findOne({ where: { id: req.params.id, userId: req.user.id } });
        if (!project) return res.status(404).json({ error: 'Project not found' });
        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// CREATE project (assign to logged-in user)
app.post('/api/projects', isAuthenticated, async (req, res) => {
    try {
        const { name, description, status, dueDate } = req.body;
        const newProject = await Project.create({ name, description, status, dueDate, userId: req.user.id });
        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// UPDATE project (must belong to user)
app.put('/api/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const { name, description, status, dueDate } = req.body;
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

// DELETE project (must belong to user)
app.delete('/api/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const deletedRowsCount = await Project.destroy({ where: { id: req.params.id, userId: req.user.id } });
        if (deletedRowsCount === 0) return res.status(404).json({ error: 'Project not found' });
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// --- TASK ROUTES ---
// GET all tasks for a user's projects
app.get('/api/tasks', isAuthenticated, async (req, res) => {
    try {
        const tasks = await Task.findAll({
            include: { model: Project, where: { userId: req.user.id } }
        });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// POST task (must belong to one of user's projects)
app.post('/api/tasks', isAuthenticated, async (req, res) => {
    try {
        const { title, description, completed, priority, dueDate, projectId } = req.body;

        // Check if project belongs to user
        const project = await Project.findOne({ where: { id: projectId, userId: req.user.id } });
        if (!project) return res.status(403).json({ error: 'Cannot add task to a project you do not own' });

        const newTask = await Task.create({ title, description, completed, priority, dueDate, projectId });
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
