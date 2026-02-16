const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'https://bluewave-express.onrender.com',
        '*'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

app.options('*', cors());

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== STATIC FILES ====================
const publicPath = path.join(__dirname, 'public');
const indexPath = path.join(publicPath, 'index.html');

console.log('='.repeat(50));
console.log('🚀 BLUEWAVE EXPRESS CARGO - SERVER STARTUP');
console.log('='.repeat(50));
console.log(`📁 Current directory: ${__dirname}`);
console.log(`📁 Public folder path: ${publicPath}`);
console.log(`📄 Index.html path: ${indexPath}`);
console.log(`📁 Public folder exists: ${fs.existsSync(publicPath)}`);
console.log(`📄 Index.html exists: ${fs.existsSync(indexPath)}`);

if (fs.existsSync(publicPath)) {
    console.log('📂 Files in public folder:', fs.readdirSync(publicPath));
}

// Serve static files
app.use(express.static(publicPath));

// ==================== MONGODB CONNECTION ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Felo:Tillen@cluster0.fdppxfi.mongodb.net/bluewave?retryWrites=true&w=majority&appName=Cluster0';

console.log('='.repeat(50));
console.log('📡 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully!');
    console.log('📊 Database: bluewave');
})
.catch(err => {
    console.error('❌ MongoDB Connection Failed:');
    console.error('Error:', err.message);
});

mongoose.connection.on('error', err => {
    console.error('🔴 MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
});

// ==================== DATABASE SCHEMAS ====================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const trackingSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    senderName: { type: String, required: true },
    receiverName: { type: String, required: true },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'],
        default: 'Pending'
    },
    currentLocation: { type: String, required: true },
    estimatedDelivery: { type: Date, required: true },
    lastUpdate: { type: Date, default: Date.now },
    history: [{
        status: String,
        location: String,
        timestamp: { type: Date, default: Date.now },
        description: String
    }]
});

const User = mongoose.model('User', userSchema);
const Tracking = mongoose.model('Tracking', trackingSchema);

// ==================== HELPER FUNCTIONS ====================
function generateTrackingNumber() {
    const prefix = 'BW';
    const numbers = Math.floor(100000000 + Math.random() * 900000000);
    return prefix + numbers;
}

// ==================== API ROUTES ====================

// ROOT TEST - This should always work
app.get('/', (req, res) => {
    res.json({ 
        message: 'Bluewave Express Cargo API is running',
        status: 'online',
        time: new Date().toISOString(),
        endpoints: {
            health: '/api/health',
            test: '/api/test',
            signup: '/api/signup (POST)',
            login: '/api/login (POST)',
            track: '/api/track/:number (GET)',
            createTracking: '/api/create-tracking (POST)'
        }
    });
});

// SIMPLE HEALTH CHECK - ALWAYS WORKS
app.get('/api/health', (req, res) => {
    console.log('✅ Health check hit from:', req.headers.origin || 'unknown');
    res.status(200).json({
        status: 'OK',
        message: 'Server is healthy',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// TEST ENDPOINT
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is working!',
        time: new Date().toISOString()
    });
});

// SIGNUP ENDPOINT
app.post('/api/signup', async (req, res) => {
    try {
        console.log('📝 Signup attempt:', req.body.email);
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, phone, password: hashedPassword });
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'bluewave_express_cargo_secret_key_2024',
            { expiresIn: '24h' }
        );

        console.log('✅ User created:', email);
        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
        });
    } catch (error) {
        console.error('❌ Signup error:', error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

// LOGIN ENDPOINT
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔑 Login attempt:', req.body.email);
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'bluewave_express_cargo_secret_key_2024',
            { expiresIn: '24h' }
        );

        console.log('✅ Login successful:', email);
        res.json({
            message: 'Login successful',
            token,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// CREATE TRACKING
app.post('/api/create-tracking', async (req, res) => {
    try {
        const { senderName, receiverName, origin, destination, estimatedDelivery } = req.body;

        if (!senderName || !receiverName || !origin || !destination || !estimatedDelivery) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const trackingNumber = generateTrackingNumber();
        const tracking = new Tracking({
            trackingNumber,
            senderName,
            receiverName,
            origin,
            destination,
            currentLocation: origin,
            estimatedDelivery: new Date(estimatedDelivery),
            history: [{
                status: 'Pending',
                location: origin,
                description: 'Shipment information received'
            }]
        });

        await tracking.save();
        console.log('📦 Tracking created:', trackingNumber);
        res.status(201).json({ message: 'Tracking created successfully', trackingNumber });
    } catch (error) {
        console.error('❌ Create tracking error:', error);
        res.status(500).json({ message: 'Error creating tracking' });
    }
});

// TRACK SHIPMENT
app.get('/api/track/:trackingNumber', async (req, res) => {
    try {
        const tracking = await Tracking.findOne({ trackingNumber: req.params.trackingNumber });

        if (!tracking) {
            return res.status(404).json({ message: 'Tracking number not found' });
        }

        const statuses = ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];
        const currentStatusIndex = statuses.indexOf(tracking.status);
        const progress = ((currentStatusIndex + 1) / statuses.length) * 100;

        res.json({
            trackingNumber: tracking.trackingNumber,
            senderName: tracking.senderName,
            receiverName: tracking.receiverName,
            origin: tracking.origin,
            destination: tracking.destination,
            status: tracking.status,
            currentLocation: tracking.currentLocation,
            estimatedDelivery: tracking.estimatedDelivery,
            lastUpdate: tracking.lastUpdate,
            progress: progress,
            history: tracking.history.reverse()
        });
    } catch (error) {
        console.error('❌ Track error:', error);
        res.status(500).json({ message: 'Error tracking shipment' });
    }
});

// ==================== SERVE FRONTEND ====================
app.get('*', (req, res) => {
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <html>
                <head><title>Error</title></head>
                <body style="background:#0a0a0a; color:#00ffff; font-family:Arial; padding:20px;">
                    <h1>⚠️ index.html not found</h1>
                    <p>Looking for: ${indexPath}</p>
                    <p>Public folder contents: ${fs.existsSync(publicPath) ? fs.readdirSync(publicPath).join(', ') : 'public folder missing'}</p>
                </body>
            </html>
        `);
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`✅ SERVER STARTED SUCCESSFULLY!`);
    console.log('='.repeat(50));
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📁 Public path: ${publicPath}`);
    console.log(`📄 Index.html exists: ${fs.existsSync(indexPath)}`);
    console.log('='.repeat(50));
});