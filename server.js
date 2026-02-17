const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Connect to MongoDB
mongoose.connect('mongodb+srv://johnpaul:jp54321@cluster0.ugm91.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("MongoDB connection successful..."))
  .catch(err => console.error("MongoDB connection error:", err));

// ============= SCHEMAS =============

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    phone: String,
    password: String,
    taskType: { type: String, enum: ['regular', 'premium'], default: 'regular' },
    balance: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false },
    awardedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    accountType: { type: String, enum: ['regular', 'premium', 'admin'], default: 'regular' },
    totalSpent: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

const User = mongoose.model('User', userSchema);

// Task Schema
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    accountType: { type: String, enum: ['regular', 'premium'], required: true },
    status: { type: String, enum: ['available', 'awarded', 'completed', 'rejected'], default: 'available' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    awardedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submission: { type: String },
    createdAt: { type: Date, default: Date.now },
});

const Task = mongoose.model('Task', taskSchema);

// Shipment Schema
const shipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, unique: true, required: true },
    recipientName: { type: String, required: true },
    recipientEmail: String,
    recipientPhone: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    carrier: String,
    carrierRef: String,
    shipmentType: { type: String, enum: ['AIR', 'WATER', 'ROAD'], default: 'ROAD' },
    product: String,
    quantity: Number,
    pieceType: String,
    description: String,
    length: Number,
    width: Number,
    height: Number,
    weight: Number,
    paymentMode: { type: String, enum: ['cash', 'bank transfer', 'card', 'mobile money'], default: 'cash' },
    expectedDelivery: Date,
    departureTime: String,
    pickupDate: Date,
    status: { 
        type: String, 
        enum: ['pending', 'on hold', 'out for delivery', 'delivered'],
        default: 'pending'
    },
    remark: String,
    updatedBy: String,
    trackingHistory: [{
        status: String,
        location: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
        updatedBy: String
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Shipment = mongoose.model('Shipment', shipmentSchema);

// JWT Secret
const JWT_SECRET = 'your_jwt_secret_key_change_this_in_production';

// ============= MIDDLEWARE =============

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (user && (user.isAdmin || user.accountType === 'admin')) {
            next();
        } else {
            res.status(403).json({ message: 'Access denied. Admin privileges required.' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error checking admin status', error });
    }
};

// ============= STATIC ROUTES =============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

// ============= AUTH ROUTES =============

app.post('/api/register', async (req, res) => {
    const { name, username, email, phone, password } = req.body;

    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email or username' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ 
            name, username, email, phone, password: hashedPassword,
            taskType: 'regular', accountType: 'regular', balance: 0, isAdmin: false
        });
        
        await user.save();
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);

        res.status(201).json({ 
            message: 'User registered successfully', 
            token,
            user: {
                id: user._id, name: user.name, username: user.username,
                email: user.email, phone: user.phone, accountType: user.accountType,
                balance: user.balance, isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ message: 'Error registering user', error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ $or: [{ username }, { email: username }] });
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials.' });

        if (user.status === 'inactive') {
            return res.status(403).json({ message: 'Account is deactivated. Contact admin.' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);

        res.status(200).json({ 
            message: 'Login successful', 
            token,
            user: {
                id: user._id, name: user.name, username: user.username,
                email: user.email, phone: user.phone, taskType: user.taskType,
                accountType: user.accountType, balance: user.balance,
                isAdmin: user.isAdmin || user.accountType === 'admin',
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        res.status(400).json({ message: 'Error logging in', error: error.message });
    }
});

// ============= SHIPMENT ROUTES =============

// Create shipment (admin only)
app.post('/api/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        console.log('Received shipment data:', req.body);
        
        const shipmentData = { ...req.body };
        
        // Generate 9-digit tracking number if not provided
        if (!shipmentData.trackingNumber) {
            let trackingNumber;
            let exists;
            do {
                trackingNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
                exists = await Shipment.findOne({ trackingNumber });
            } while (exists);
            shipmentData.trackingNumber = trackingNumber;
        } else {
            // Validate 9-digit format
            if (!/^\d{9}$/.test(shipmentData.trackingNumber)) {
                return res.status(400).json({ message: 'Tracking number must be exactly 9 digits' });
            }
            
            // Check if tracking number already exists
            const existing = await Shipment.findOne({ trackingNumber: shipmentData.trackingNumber });
            if (existing) {
                return res.status(400).json({ message: 'Tracking number already exists' });
            }
        }

        // Clean up empty values
        Object.keys(shipmentData).forEach(key => {
            if (shipmentData[key] === '' || shipmentData[key] === null || shipmentData[key] === undefined) {
                delete shipmentData[key];
            }
        });

        // Add initial tracking history
        shipmentData.trackingHistory = [{
            status: shipmentData.status || 'pending',
            location: shipmentData.origin || 'Origin',
            message: 'Shipment created',
            timestamp: new Date(),
            updatedBy: shipmentData.updatedBy || 'Admin'
        }];

        const shipment = new Shipment(shipmentData);
        await shipment.save();

        console.log('Shipment created successfully:', shipment.trackingNumber);

        res.status(201).json({ 
            message: 'Shipment created successfully', 
            shipment,
            trackingNumber: shipment.trackingNumber 
        });
    } catch (error) {
        console.error('Create shipment error:', error);
        res.status(400).json({ message: 'Error creating shipment', error: error.message });
    }
});

// Get all shipments (admin only)
app.get('/api/admin/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 });
        res.status(200).json(shipments);
    } catch (error) {
        console.error('Error fetching shipments:', error);
        res.status(400).json({ message: 'Error fetching shipments', error: error.message });
    }
});

// Public tracking - NO AUTH REQUIRED
app.get('/api/shipments/track/:trackingNumber', async (req, res) => {
    try {
        console.log('Tracking search for:', req.params.trackingNumber);
        
        const shipment = await Shipment.findOne({ 
            trackingNumber: req.params.trackingNumber 
        });

        if (!shipment) {
            console.log('Shipment not found');
            return res.status(404).json({ message: 'Shipment not found' });
        }

        console.log('Shipment found:', shipment.trackingNumber);
        res.status(200).json(shipment);
    } catch (error) {
        console.error('Error tracking shipment:', error);
        res.status(400).json({ message: 'Error tracking shipment', error: error.message });
    }
});

// Get single shipment by ID (admin only)
app.get('/api/admin/shipments/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }
        res.status(200).json(shipment);
    } catch (error) {
        console.error('Error fetching shipment:', error);
        res.status(400).json({ message: 'Error fetching shipment', error: error.message });
    }
});

// Update shipment status (admin only)
app.put('/api/admin/shipments/:id/status', authenticate, isAdmin, async (req, res) => {
    try {
        const { status, location, message, updatedBy } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }

        shipment.status = status || shipment.status;
        shipment.trackingHistory.push({
            status: shipment.status,
            location: location || shipment.origin,
            message: message || `Status updated to ${shipment.status}`,
            timestamp: new Date(),
            updatedBy: updatedBy || 'Admin'
        });

        shipment.updatedAt = new Date();
        await shipment.save();

        res.status(200).json({ 
            message: 'Shipment status updated successfully', 
            shipment 
        });
    } catch (error) {
        console.error('Error updating shipment status:', error);
        res.status(400).json({ message: 'Error updating shipment status', error: error.message });
    }
});

// Delete shipment (admin only)
app.delete('/api/admin/shipments/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const shipment = await Shipment.findByIdAndDelete(req.params.id);
        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }
        res.status(200).json({ message: 'Shipment deleted successfully' });
    } catch (error) {
        console.error('Error deleting shipment:', error);
        res.status(400).json({ message: 'Error deleting shipment', error: error.message });
    }
});

// Dashboard stats (admin only)
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const totalShipments = await Shipment.countDocuments();
        const activeShipments = await Shipment.countDocuments({ 
            status: { $in: ['pending', 'on hold', 'out for delivery'] }
        });
        const deliveredShipments = await Shipment.countDocuments({ status: 'delivered' });
        const pendingShipments = await Shipment.countDocuments({ status: 'pending' });
        
        const recentShipments = await Shipment.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('trackingNumber recipientName origin destination status');

        res.status(200).json({
            totalShipments,
            activeShipments,
            deliveredShipments,
            pendingShipments,
            recentShipments
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(400).json({ message: 'Error fetching stats', error: error.message });
    }
});

// ============= HEALTH CHECK =============

app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Bluewave Express Cargo API is running',
        timestamp: new Date().toISOString()
    });
});

// ============= ERROR HANDLING =============

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
});

// ============= START SERVER =============

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Access your app at: http://localhost:${PORT}`);
});