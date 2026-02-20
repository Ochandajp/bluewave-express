const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Log all requests for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ============= MongoDB Connection =============
const MONGODB_URI = 'mongodb+srv://johnpaul:jp54321@cluster0.ugm91.mongodb.net/shipping_db?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log('✅ MongoDB connected successfully');
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
});

// ============= SCHEMAS =============

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    phone: String,
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: true },
    accountType: { type: String, enum: ['user', 'admin'], default: 'admin' },
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

// Shipment Schema - ALREADY HAS ALL FIELDS INCLUDING SENDER INFO
const shipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, unique: true, required: true },
    
    // Sender Information
    senderName: { type: String, default: '' },
    senderEmail: { type: String, default: '' },
    senderPhone: { type: String, default: '' },
    senderAddress: { type: String, default: '' },
    
    // Recipient Information
    recipientName: { type: String, default: '' },
    recipientEmail: { type: String, default: '' },
    recipientPhone: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    
    // Shipment Information
    origin: { type: String, default: '' },
    destination: { type: String, default: '' },
    carrier: { type: String, default: '' },
    carrierRef: { type: String, default: '' },
    shipmentType: { type: String, default: 'ROAD' },
    
    // Package Details
    product: { type: String, default: '' },
    quantity: { type: String, default: '' },
    pieceType: { type: String, default: '' },
    packageType: { type: String, default: '' },
    packageStatus: { type: String, default: '' },
    description: { type: String, default: '' },
    length: { type: String, default: '' },
    width: { type: String, default: '' },
    height: { type: String, default: '' },
    weight: { type: String, default: '' },
    
    // Payment
    paymentMode: { type: String, default: 'cash' },
    freightCost: { type: Number, default: 0 },
    
    // Dates
    expectedDelivery: { type: String, default: '' },
    departureDate: { type: String, default: '' },
    pickupDate: { type: String, default: '' },
    departureTime: { type: String, default: '' },
    
    // Status
    status: { 
        type: String, 
        enum: ['pending', 'on hold', 'out for delivery', 'delivered'],
        default: 'pending'
    },
    
    // Remarks
    remark: { type: String, default: '' },
    comment: { type: String, default: '' },
    
    // Tracking History
    trackingHistory: [{
        status: String,
        location: String,
        message: String,
        remark: String,
        timestamp: { type: Date, default: Date.now }
    }],
    
    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Shipment = mongoose.model('Shipment', shipmentSchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production';

// ============= MIDDLEWARE =============

const authenticate = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (user && (user.isAdmin || user.accountType === 'admin')) {
            next();
        } else {
            res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error checking admin status' });
    }
};

// ============= TEST ROUTES =============

app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is working!',
        time: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
    
    res.json({ 
        success: true,
        status: 'OK', 
        message: 'Server is running',
        database: dbStatus,
        timestamp: new Date().toISOString()
    });
});

// ============= REGISTRATION ROUTE =============

app.post('/api/register', async (req, res) => {
    try {
        const { name, username, email, phone, password } = req.body;

        if (!name || !username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name, username, email and password are required' 
            });
        }

        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email or username' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            username,
            email,
            phone: phone || '',
            password: hashedPassword,
            isAdmin: true,
            accountType: 'admin',
            status: 'active'
        });

        await user.save();

        const token = jwt.sign(
            { id: user._id, username: user.username, isAdmin: user.isAdmin }, 
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({ 
            success: true,
            message: 'Admin registered successfully', 
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                accountType: user.accountType,
                role: 'admin'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error registering user',
            error: error.message 
        });
    }
});

// ============= SETUP ADMIN ROUTE =============

app.get('/api/setup-admin', async (req, res) => {
    try {
        console.log('🔧 Setting up admin...');
        
        const adminExists = await User.findOne({ 
            $or: [
                { isAdmin: true },
                { accountType: 'admin' }
            ]
        });
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = new User({
                name: 'System Administrator',
                username: 'admin',
                email: 'admin@bluewave.com',
                phone: '+1234567890',
                password: hashedPassword,
                isAdmin: true,
                accountType: 'admin',
                status: 'active'
            });
            
            await admin.save();
            
            console.log('✅ Admin created successfully');
            
            res.json({ 
                success: true,
                message: '✅ Admin created successfully!', 
                credentials: {
                    username: 'admin',
                    password: 'admin123'
                },
                note: 'You can now login with these credentials'
            });
        } else {
            console.log('✅ Admin already exists');
            
            res.json({ 
                success: true,
                message: '✅ Admin already exists', 
                note: 'You can create new admin accounts through the registration form'
            });
        }
    } catch (error) {
        console.error('❌ Setup admin error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error setting up admin', 
            error: error.message 
        });
    }
});

// ============= STATIC ROUTES =============

// Serve index.html at root
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('index.html not found');
    }
});

// Serve admin.html at /admin
app.get('/admin', (req, res) => {
    const filePath = path.join(__dirname, 'admin.html');
    console.log('Looking for admin.html at:', filePath);
    
    if (fs.existsSync(filePath)) {
        console.log('✅ admin.html found, serving...');
        res.sendFile(filePath);
    } else {
        console.error('❌ admin.html NOT FOUND at:', filePath);
        res.status(404).send(`
            <h1>admin.html not found</h1>
            <p>Looking for: ${filePath}</p>
            <p>Current directory: ${__dirname}</p>
            <p>Files in directory:</p>
            <ul>
                ${fs.readdirSync(__dirname).map(file => `<li>${file}</li>`).join('')}
            </ul>
        `);
    }
});

// ============= LOGIN ROUTE =============

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username and password required' 
            });
        }

        const user = await User.findOne({ 
            $or: [{ username: username }, { email: username }] 
        });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        if (user.status === 'inactive') {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is deactivated' 
            });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { 
                id: user._id, 
                username: user.username, 
                isAdmin: user.isAdmin 
            }, 
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true,
            message: 'Login successful', 
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin || user.accountType === 'admin',
                accountType: user.accountType,
                role: user.isAdmin ? 'admin' : 'user'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error occurred during login' 
        });
    }
});

// ============= USER PROFILE ROUTE =============

app.get('/api/user', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching user' 
        });
    }
});

// ============= SHIPMENT ROUTES =============

// Public tracking route
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

// ============= FIXED: CREATE NEW SHIPMENT ROUTE =============
// This now properly saves ALL fields including sender information
app.post('/api/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        console.log('📦 RECEIVED SHIPMENT DATA:', JSON.stringify(req.body, null, 2));
        
        const data = req.body;
        
        // Generate tracking number if not provided
        let trackingNumber = data.trackingNumber;
        if (!trackingNumber) {
            let exists;
            do {
                trackingNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
                exists = await Shipment.findOne({ trackingNumber });
            } while (exists);
        }

        // Create shipment object with ALL fields explicitly mapped
        // This ensures EVERY field from the frontend is saved
        const shipmentData = {
            trackingNumber: trackingNumber,
            
            // SENDER INFORMATION - THESE WERE MISSING BEFORE
            senderName: data.senderName || '',
            senderEmail: data.senderEmail || '',
            senderPhone: data.senderPhone || '',
            senderAddress: data.senderAddress || '',
            
            // RECIPIENT INFORMATION
            recipientName: data.recipientName || '',
            recipientEmail: data.recipientEmail || '',
            recipientPhone: data.recipientPhone || '',
            deliveryAddress: data.deliveryAddress || '',
            
            // SHIPMENT INFORMATION
            origin: data.origin || '',
            destination: data.destination || '',
            carrier: data.carrier || '',
            shipmentType: data.shipmentType || 'ROAD',
            
            // PACKAGE DETAILS
            product: data.product || '',
            quantity: data.quantity ? data.quantity.toString() : '',
            pieceType: data.pieceType || '',
            packageType: data.packageType || '',
            packageStatus: data.packageStatus || '',
            description: data.description || '',
            length: data.length ? data.length.toString() : '',
            width: data.width ? data.width.toString() : '',
            height: data.height ? data.height.toString() : '',
            weight: data.weight ? data.weight.toString() : '',
            
            // PAYMENT
            paymentMode: data.paymentMode || 'cash',
            freightCost: data.freightCost || 0,
            
            // DATES
            expectedDelivery: data.expectedDelivery || '',
            departureDate: data.departureDate || '',
            pickupDate: data.pickupDate || '',
            
            // STATUS
            status: data.status || 'pending',
            
            // REMARKS
            remark: data.comment || '',
            comment: data.comment || '',
            
            // TRACKING HISTORY
            trackingHistory: [{
                status: data.status || 'pending',
                location: data.origin || 'Origin',
                message: 'Shipment created',
                remark: data.comment || 'Initial shipment registration',
                timestamp: new Date()
            }],
            
            // METADATA
            createdBy: req.user.id,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        console.log('📦 SAVING SHIPMENT WITH DATA:', shipmentData);
        
        const shipment = new Shipment(shipmentData);
        await shipment.save();
        
        console.log('✅ SHIPMENT SAVED SUCCESSFULLY!');
        console.log('✅ Tracking:', shipment.trackingNumber);
        console.log('✅ Sender Name:', shipment.senderName);
        console.log('✅ Sender Phone:', shipment.senderPhone);
        console.log('✅ Sender Address:', shipment.senderAddress);
        console.log('✅ Recipient Name:', shipment.recipientName);
        console.log('✅ Origin:', shipment.origin);
        console.log('✅ Destination:', shipment.destination);

        res.status(201).json({ 
            success: true,
            message: 'Shipment created successfully', 
            trackingNumber: shipment.trackingNumber,
            shipmentId: shipment._id
        });

    } catch (error) {
        console.error('❌ ERROR SAVING SHIPMENT:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error creating shipment: ' + error.message 
        });
    }
});

// Get all shipments (admin)
app.get('/api/admin/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 });
        console.log(`📋 Found ${shipments.length} shipments`);
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

// Get single shipment by ID
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

// Update shipment status with remarks
app.put('/api/admin/shipments/:id/status', authenticate, isAdmin, async (req, res) => {
    try {
        const { status, location, message, remark } = req.body;
        
        if (!remark || remark.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Remarks are required for status update' 
            });
        }

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ 
                success: false,
                message: 'Shipment not found' 
            });
        }

        shipment.status = status || shipment.status;
        
        shipment.trackingHistory.push({
            status: shipment.status,
            location: location || shipment.origin || 'Unknown',
            message: message || `Status updated to ${shipment.status}`,
            remark: remark,
            timestamp: new Date()
        });

        shipment.remark = remark;
        shipment.comment = remark;
        shipment.updatedAt = new Date();
        
        await shipment.save();

        res.json({ 
            success: true,
            message: 'Shipment status updated successfully with remarks'
        });
    } catch (error) {
        console.error('Error updating shipment status:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating shipment status' 
        });
    }
});

// Update freight cost
app.put('/api/admin/shipments/:id/freight', authenticate, isAdmin, async (req, res) => {
    try {
        const { freightCost } = req.body;
        
        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ 
                success: false,
                message: 'Shipment not found' 
            });
        }

        shipment.freightCost = freightCost || 0;
        shipment.updatedAt = new Date();
        
        await shipment.save();

        res.json({ 
            success: true,
            message: 'Freight cost updated successfully'
        });
    } catch (error) {
        console.error('Error updating freight cost:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating freight cost' 
        });
    }
});

// Delete shipment
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

// Get admin stats
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const totalShipments = await Shipment.countDocuments();
        const activeShipments = await Shipment.countDocuments({ 
            status: { $in: ['out for delivery', 'on hold'] }
        });
        const deliveredShipments = await Shipment.countDocuments({ status: 'delivered' });
        const pendingShipments = await Shipment.countDocuments({ status: 'pending' });
        const totalUsers = await User.countDocuments();
        const adminUsers = await User.countDocuments({ isAdmin: true });
        
        const recentShipments = await Shipment.find()
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            success: true,
            totalShipments,
            activeShipments,
            deliveredShipments,
            pendingShipments,
            totalUsers,
            adminUsers,
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

// Debug route to check database
app.get('/api/debug/check-db', authenticate, isAdmin, async (req, res) => {
    try {
        const count = await Shipment.countDocuments();
        const sample = await Shipment.findOne().sort({ createdAt: -1 });
        res.json({
            success: true,
            databaseConnected: mongoose.connection.readyState === 1,
            totalShipments: count,
            latestShipment: sample ? {
                trackingNumber: sample.trackingNumber,
                senderName: sample.senderName,
                senderPhone: sample.senderPhone,
                senderAddress: sample.senderAddress,
                recipientName: sample.recipientName,
                packageType: sample.packageType,
                departureDate: sample.departureDate,
                createdAt: sample.createdAt
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Debug route to list files
app.get('/api/debug/files', (req, res) => {
    try {
        const files = fs.readdirSync(__dirname);
        res.json({
            success: true,
            currentDirectory: __dirname,
            files: files
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= ERROR HANDLING =============

app.use((req, res) => {
    console.log('404 Not Found:', req.method, req.url);
    res.status(404).json({ 
        success: false, 
        message: 'Route not found',
        path: req.url,
        method: req.method
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: err.message 
    });
});

// ============= START SERVER =============
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📱 Test API: http://localhost:${PORT}/api/test`);
    console.log(`📝 Register: http://localhost:${PORT}/api/register (POST)`);
    console.log(`🔧 Setup Admin: http://localhost:${PORT}/api/setup-admin`);
    console.log(`🔑 Login: http://localhost:${PORT}/api/login (POST)`);
    console.log(`📦 Public Tracking: http://localhost:${PORT}`);
    console.log(`👤 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🔍 Debug DB: http://localhost:${PORT}/api/debug/check-db (need auth)`);
    console.log(`📁 Debug Files: http://localhost:${PORT}/api/debug/files\n`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});