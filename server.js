const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============= MongoDB Connection =============
// Your exact MongoDB URL with the 'site' database
const MONGODB_URI = 'mongodb+srv://johnpaul:jp54321@cluster0.ugm91.mongodb.net/';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log('📊 Database:', mongoose.connection.name);
    console.log('📦 Collections:', Object.keys(mongoose.connection.collections));
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
});

// ============= SCHEMAS =============

// Admin Schema (will create 'admins' collection)
const adminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date
});

// Shipment Schema (matching your existing 'shipments' collection)
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
}, { collection: 'shipments' }); // Explicitly use 'shipments' collection

const Admin = mongoose.model('Admin', adminSchema);
const Shipment = mongoose.model('Shipment', shipmentSchema);

// JWT Secret
const JWT_SECRET = 'bluewave_express_cargo_secret_key_2026';

// ============= MIDDLEWARE =============

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const admin = await Admin.findById(req.admin.id);
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error checking admin status' });
    }
};

// ============= TEST ROUTES =============

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is working!',
        database: mongoose.connection.name,
        time: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        message: 'Server is running',
        database: mongoose.connection.name,
        timestamp: new Date().toISOString()
    });
});

// ============= STATIC ROUTES =============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ============= SETUP ADMIN =============

app.get('/api/setup-admin', async (req, res) => {
    try {
        // Check if admin exists in the admins collection
        const adminExists = await Admin.findOne({ username: 'admin' });
        
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
        res.status(500).json({ 
            success: false,
            message: 'Error setting up admin', 
            error: error.message 
        });
    }
});

// ============= ADMIN LOGIN =============

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await Admin.findOne({ 
            $or: [{ username }, { email: username }] 
        });
        
        if (!admin) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        const isValid = await bcrypt.compare(password, admin.password);
        if (!isValid) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
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
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                username: admin.username,
                email: admin.email
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: 'Server error' 
        });
    }
});

// ============= PUBLIC TRACKING =============
// This reads from your existing 'shipments' collection

app.get('/api/shipments/track/:trackingNumber', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });

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
        res.status(500).json({ 
            success: false,
            message: 'Error tracking shipment' 
        });
    }
});

// ============= ADMIN SHIPMENT ROUTES =============
// These write to your existing 'shipments' collection

// Create shipment
app.post('/api/shipments', authenticate, isAdmin, async (req, res) => {
    try {
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
        res.status(500).json({ 
            success: false,
            message: 'Error creating shipment' 
        });
    }
});

// Get all shipments
app.get('/api/admin/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            shipments
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: 'Error fetching shipments' 
        });
    }
});

// Get single shipment
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
        res.status(500).json({ 
            success: false,
            message: 'Error fetching shipment' 
        });
    }
});

// Delete shipment
app.delete('/api/admin/shipments/:id', authenticate, isAdmin, async (req, res) => {
    try {
        await Shipment.findByIdAndDelete(req.params.id);
        res.json({ 
            success: true,
            message: 'Shipment deleted successfully' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: 'Error deleting shipment' 
        });
    }
});

// Dashboard stats
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
            .limit(5);

        res.json({
            success: true,
            totalShipments,
            activeShipments,
            deliveredShipments,
            pendingShipments,
            recentShipments
        });
    } catch (error) {
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
    console.log(`🔑 Admin Panel: https://bluewave-express-cargo.onrender.com/admin`);
    console.log(`📦 Database: site`);
    console.log(`📁 Shipments collection: shipments\n`);
});