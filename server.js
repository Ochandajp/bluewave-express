const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// ============= CORS SETTINGS =============
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ============= MongoDB Connection =============
const MONGODB_URI = 'mongodb+srv://johnpaul:jp54321@cluster0.ugm91.mongodb.net/bluewave?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
});

// ============= SCHEMAS =============

// Admin Schema
const adminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date
});

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

const Admin = mongoose.model('Admin', adminSchema);
const Shipment = mongoose.model('Shipment', shipmentSchema);

// JWT Secret
const JWT_SECRET = 'bluewave_express_cargo_secret_key_2026';

// ============= MIDDLEWARE =============

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const admin = await Admin.findById(req.admin.id);
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error checking admin status' });
    }
};

// ============= STATIC ROUTES =============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ============= API ROUTES =============

// TEST ROUTE - Always works
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is working!',
        time: new Date().toISOString()
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// SETUP ADMIN - FIXED ROUTE
app.get('/api/setup-admin', async (req, res) => {
    try {
        console.log('Setting up admin...');
        
        // Check if admin exists
        const adminExists = await Admin.findOne({ 
            $or: [
                { username: 'admin' },
                { email: 'admin@bluewave.com' }
            ]
        });
        
        if (!adminExists) {
            // Create new admin
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = new Admin({
                name: 'System Administrator',
                username: 'admin',
                email: 'admin@bluewave.com',
                password: hashedPassword,
                isAdmin: true
            });
            
            await admin.save();
            
            res.json({ 
                success: true,
                message: '✅ Admin created successfully!', 
                credentials: {
                    username: 'admin',
                    password: 'admin123'
                }
            });
        } else {
            res.json({ 
                success: true,
                message: '✅ Admin already exists', 
                credentials: {
                    username: 'admin',
                    password: 'admin123'
                }
            });
        }
    } catch (error) {
        console.error('Setup admin error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error setting up admin', 
            error: error.message 
        });
    }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('Login attempt for:', username);

        if (!username || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Username and password are required' 
            });
        }

        const admin = await Admin.findOne({ 
            $or: [{ username }, { email: username }] 
        });
        
        if (!admin) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials.' 
            });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials.' 
            });
        }

        admin.lastLogin = new Date();
        await admin.save();

        const token = jwt.sign(
            { id: admin._id, username: admin.username }, 
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true,
            message: 'Login successful', 
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                username: admin.username,
                email: admin.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during login' 
        });
    }
});

// Public tracking
app.get('/api/shipments/track/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        
        const shipment = await Shipment.findOne({ trackingNumber });

        if (!shipment) {
            return res.status(404).json({ 
                success: false,
                message: 'Shipment not found' 
            });
        }

        res.json({
            success: true,
            shipment
        });
    } catch (error) {
        console.error('Tracking error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error tracking shipment' 
        });
    }
});

// Create shipment (admin only)
app.post('/api/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        console.log('Creating new shipment...');
        
        const shipmentData = { ...req.body };
        
        // Generate tracking number if not provided
        if (!shipmentData.trackingNumber) {
            let trackingNumber;
            let exists;
            do {
                trackingNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
                exists = await Shipment.findOne({ trackingNumber });
            } while (exists);
            shipmentData.trackingNumber = trackingNumber;
        }

        // Add initial tracking history
        shipmentData.trackingHistory = [{
            status: shipmentData.status || 'pending',
            location: shipmentData.origin || 'Origin',
            message: 'Shipment created',
            timestamp: new Date(),
            updatedBy: req.admin.username || 'Admin'
        }];

        const shipment = new Shipment(shipmentData);
        await shipment.save();

        res.json({ 
            success: true,
            message: 'Shipment created successfully', 
            trackingNumber: shipment.trackingNumber 
        });
    } catch (error) {
        console.error('Create shipment error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error creating shipment: ' + error.message 
        });
    }
});

// Get all shipments (admin only)
app.get('/api/admin/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            shipments
        });
    } catch (error) {
        console.error('Error fetching shipments:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching shipments' 
        });
    }
});

// Get single shipment by ID (admin only)
app.get('/api/admin/shipments/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ 
                success: false,
                message: 'Shipment not found' 
            });
        }
        res.json({
            success: true,
            shipment
        });
    } catch (error) {
        console.error('Error fetching shipment:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching shipment' 
        });
    }
});

// Delete shipment (admin only)
app.delete('/api/admin/shipments/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const shipment = await Shipment.findByIdAndDelete(req.params.id);
        if (!shipment) {
            return res.status(404).json({ 
                success: false,
                message: 'Shipment not found' 
            });
        }
        res.json({ 
            success: true,
            message: 'Shipment deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting shipment:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error deleting shipment' 
        });
    }
});

// Dashboard stats (admin only)
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const totalShipments = await Shipment.countDocuments();
        const activeShipments = await Shipment.countDocuments({ 
            status: { $in: ['out for delivery', 'on hold'] }
        });
        const deliveredShipments = await Shipment.countDocuments({ status: 'delivered' });
        const pendingShipments = await Shipment.countDocuments({ status: 'pending' });
        
        const recentShipments = await Shipment.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('trackingNumber recipientName origin destination status');

        res.json({
            success: true,
            totalShipments,
            activeShipments,
            deliveredShipments,
            pendingShipments,
            recentShipments
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching stats' 
        });
    }
});

// ============= START SERVER =============
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📱 Test API: https://bluewave-express-cargo.onrender.com/api/test`);
    console.log(`🔧 Setup Admin: https://bluewave-express-cargo.onrender.com/api/setup-admin`);
    console.log(`🩺 Health Check: https://bluewave-express-cargo.onrender.com/api/health`);
    console.log(`🔑 Admin Login: https://bluewave-express-cargo.onrender.com/admin`);
    console.log(`📦 Public Tracking: https://bluewave-express-cargo.onrender.com\n`);
});