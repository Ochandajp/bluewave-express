const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://Felo:Tillen@cluster0.fdppxfi.mongodb.net/bluewave?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB successfully'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
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

// Routes
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            name,
            email,
            phone,
            password: hashedPassword
        });

        await user.save();

        // Create token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            'your_jwt_secret_key_here',
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

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Create token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            'your_jwt_secret_key_here',
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

// Create tracking (admin only - you can add authentication later)
app.post('/api/create-tracking', async (req, res) => {
    try {
        const { senderName, receiverName, origin, destination, estimatedDelivery } = req.body;
        
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

        // Calculate progress
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
            history: tracking.history
        });
    } catch (error) {
        console.error('Track error:', error);
        res.status(500).json({ message: 'Error tracking shipment' });
    }
});

// Update tracking status (admin only)
app.put('/api/update-tracking/:trackingNumber', async (req, res) => {
    try {
        const { status, location, description } = req.body;
        
        const tracking = await Tracking.findOne({ 
            trackingNumber: req.params.trackingNumber 
        });

        if (!tracking) {
            return res.status(404).json({ message: 'Tracking number not found' });
        }

        tracking.status = status;
        tracking.currentLocation = location;
        tracking.lastUpdate = new Date();
        tracking.history.push({
            status,
            location,
            description: description || `Shipment ${status.toLowerCase()}`
        });

        await tracking.save();

        res.json({
            message: 'Tracking updated successfully',
            tracking
        });
    } catch (error) {
        console.error('Update tracking error:', error);
        res.status(500).json({ message: 'Error updating tracking' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});