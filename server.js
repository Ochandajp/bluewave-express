const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IMPORTANT: Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Felo:Tillen@cluster0.fdppxfi.mongodb.net/bluewave?retryWrites=true&w=majority&appName=Cluster0';

console.log('📡 Attempting to connect to MongoDB...');
console.log('📍 Current directory:', __dirname);
console.log('📁 Public folder path:', path.join(__dirname, 'public'));

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ Successfully connected to MongoDB Atlas');
    console.log('📊 Database: bluewave');
})
.catch(err => {
    console.error('❌ MongoDB connection error:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
});

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Tracking Schema
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

// Generate random tracking number
function generateTrackingNumber() {
    const prefix = 'BW';
    const numbers = Math.floor(100000000 + Math.random() * 900000000);
    return prefix + numbers;
}

// ==================== API ROUTES ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        database: 'bluewave',
        staticPath: path.join(__dirname, 'public'),
        timestamp: new Date().toISOString()
    });
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            phone,
            password: hashedPassword
        });

        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'bluewave_express_cargo_secret_key_2024',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
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

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// Create tracking
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

        res.status(201).json({
            message: 'Tracking created successfully',
            trackingNumber
        });
    } catch (error) {
        console.error('Create tracking error:', error);
        res.status(500).json({ message: 'Error creating tracking' });
    }
});

// Track shipment
app.get('/api/track/:trackingNumber', async (req, res) => {
    try {
        const tracking = await Tracking.findOne({ 
            trackingNumber: req.params.trackingNumber 
        });

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
        console.error('Track error:', error);
        res.status(500).json({ message: 'Error tracking shipment' });
    }
});

// ==================== FRONTEND ROUTE ====================
// This serves your index.html for all non-API routes
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('📄 Serving index.html from:', indexPath);
    res.sendFile(indexPath);
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📁 Current directory: ${__dirname}`);
    console.log(`📁 Public folder: ${path.join(__dirname, 'public')}`);
    console.log(`📄 Index.html exists: ${require('fs').existsSync(path.join(__dirname, 'public', 'index.html'))}`);
});