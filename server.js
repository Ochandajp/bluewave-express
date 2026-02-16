const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'views')));

// MongoDB Connection
const mongoURI = "mongodb+srv://Felo:Tillen@cluster0.fdppxfi.mongodb.net/bluewave?retryWrites=true&w=majority";

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// Session configuration
app.use(session({
    secret: 'bluewave-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: mongoURI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        httpOnly: true
    }
}));

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

const User = mongoose.model('User', userSchema);

// Tracking Schema
const trackingSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: String,
    senderAddress: String,
    receiverName: String,
    receiverAddress: String,
    weight: String,
    dimensions: String,
    status: { 
        type: String, 
        default: 'pending',
        enum: ['pending', 'in-transit', 'out-for-delivery', 'delivered']
    },
    currentLocation: String,
    estimatedDelivery: Date,
    lastUpdate: { type: Date, default: Date.now },
    statusHistory: [{
        status: String,
        location: String,
        timestamp: { type: Date, default: Date.now },
        description: String
    }]
});

const Tracking = mongoose.model('Tracking', trackingSchema);

// Routes

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Signup Route
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create new user
        const user = new User({ name, email, phone, password });
        await user.save();
        
        // Create session
        req.session.userId = user._id;
        req.session.userEmail = user.email;
        
        res.status(201).json({ 
            message: 'User created successfully',
            user: { name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Error creating user' });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Create session
        req.session.userId = user._id;
        req.session.userEmail = user.email;
        
        res.json({ 
            message: 'Login successful',
            user: { name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error logging in' });
    }
});

// Logout Route
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Check Auth Status
app.get('/api/auth-status', (req, res) => {
    if (req.session.userId) {
        res.json({ 
            loggedIn: true,
            userId: req.session.userId,
            email: req.session.userEmail
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Create Tracking Number (Protected)
app.post('/api/tracking/create', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Please login first' });
        }
        
        // Generate tracking number
        const trackingNumber = 'BWX' + Date.now().toString().slice(-8) + 
                              Math.random().toString(36).substring(2, 5).toUpperCase();
        
        const { 
            senderName, senderAddress, 
            receiverName, receiverAddress,
            weight, dimensions 
        } = req.body;
        
        const tracking = new Tracking({
            trackingNumber,
            userId: req.session.userId,
            senderName,
            senderAddress,
            receiverName,
            receiverAddress,
            weight,
            dimensions,
            status: 'pending',
            currentLocation: 'Processing Center',
            estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            statusHistory: [{
                status: 'pending',
                location: 'Processing Center',
                description: 'Shipment information received'
            }]
        });
        
        await tracking.save();
        
        res.status(201).json({ 
            message: 'Tracking number created',
            trackingNumber: tracking.trackingNumber
        });
    } catch (error) {
        console.error('Create tracking error:', error);
        res.status(500).json({ error: 'Error creating tracking number' });
    }
});

// Track Shipment
app.post('/api/tracking/track', async (req, res) => {
    try {
        const { trackingNumber } = req.body;
        
        const tracking = await Tracking.findOne({ trackingNumber });
        
        if (!tracking) {
            return res.status(404).json({ error: 'Tracking number not found' });
        }
        
        res.json({
            trackingNumber: tracking.trackingNumber,
            status: tracking.status,
            currentLocation: tracking.currentLocation,
            estimatedDelivery: tracking.estimatedDelivery,
            lastUpdate: tracking.lastUpdate,
            statusHistory: tracking.statusHistory,
            senderName: tracking.senderName,
            receiverName: tracking.receiverName
        });
    } catch (error) {
        console.error('Track error:', error);
        res.status(500).json({ error: 'Error tracking shipment' });
    }
});

// Get User's Tracking Numbers
app.get('/api/user/trackings', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Please login first' });
        }
        
        const trackings = await Tracking.find({ userId: req.session.userId })
                                       .sort({ lastUpdate: -1 });
        
        res.json(trackings);
    } catch (error) {
        console.error('Get trackings error:', error);
        res.status(500).json({ error: 'Error fetching trackings' });
    }
});

// Update Tracking Status (Admin only - for demonstration)
app.post('/api/tracking/update/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { status, location, description } = req.body;
        
        const tracking = await Tracking.findOne({ trackingNumber });
        
        if (!tracking) {
            return res.status(404).json({ error: 'Tracking number not found' });
        }
        
        tracking.status = status;
        tracking.currentLocation = location;
        tracking.lastUpdate = new Date();
        tracking.statusHistory.push({
            status,
            location,
            description: description || `Shipment ${status}`
        });
        
        await tracking.save();
        
        res.json({ message: 'Tracking updated successfully' });
    } catch (error) {
        console.error('Update tracking error:', error);
        res.status(500).json({ error: 'Error updating tracking' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Visit http://localhost:${PORT} to view the website`);
});