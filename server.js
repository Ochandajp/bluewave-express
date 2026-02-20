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

// Serve static files
app.use(express.static(path.join(__dirname)));

// Log all requests
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

// Sender Schema (NEW)
const senderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: String,
    phone: { type: String, required: true },
    address: { type: String, required: true },
    company: String,
    taxId: String,
    createdAt: { type: Date, default: Date.now }
});

// Recipient Schema (NEW)
const recipientSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: String,
    phone: { type: String, required: true },
    address: { type: String, required: true },
    company: String,
    createdAt: { type: Date, default: Date.now }
});

// Shipment Schema (UPDATED)
const shipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, unique: true, required: true },
    
    // References
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sender', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Shipment Details
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    carrier: String,
    carrierRef: String,
    shipmentType: { type: String, enum: ['AIR', 'ROAD', 'WATER', 'RAIL'], default: 'ROAD' },
    
    // Package Details
    packageType: String,
    packageStatus: String,
    product: String,
    quantity: String,
    pieceType: String,
    description: String,
    length: String,
    width: String,
    height: String,
    weight: String,
    
    // Payment
    paymentMode: { type: String, default: 'cash' },
    freightCost: { type: Number, default: 0 },
    
    // Dates
    departureDate: String,
    pickupDate: String,
    expectedDelivery: String,
    
    // Status
    status: { 
        type: String, 
        enum: ['pending', 'on hold', 'out for delivery', 'delivered'],
        default: 'pending'
    },
    
    // Remarks
    remark: String,
    comment: String,
    
    // Tracking History
    trackingHistory: [{
        status: String,
        location: String,
        message: String,
        remark: String,
        timestamp: { type: Date, default: Date.now }
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Shipment Detail Schema (NEW - for additional flexible details)
const shipmentDetailSchema = new mongoose.Schema({
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
    details: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Sender = mongoose.model('Sender', senderSchema);
const Recipient = mongoose.model('Recipient', recipientSchema);
const Shipment = mongoose.model('Shipment', shipmentSchema);
const ShipmentDetail = mongoose.model('ShipmentDetail', shipmentDetailSchema);

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

// ============= SENDER ROUTES (NEW) =============

// Create a new sender
app.post('/api/senders', authenticate, async (req, res) => {
    try {
        const senderData = {
            ...req.body,
            userId: req.user.id
        };
        
        const sender = new Sender(senderData);
        await sender.save();
        
        res.status(201).json({
            success: true,
            message: 'Sender created successfully',
            sender
        });
    } catch (error) {
        console.error('Error creating sender:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating sender'
        });
    }
});

// Get all senders
app.get('/api/senders', authenticate, async (req, res) => {
    try {
        const senders = await Sender.find({ userId: req.user.id });
        res.json({
            success: true,
            senders
        });
    } catch (error) {
        console.error('Error fetching senders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching senders'
        });
    }
});

// ============= RECIPIENT ROUTES (NEW) =============

// Create a new recipient
app.post('/api/recipients', authenticate, async (req, res) => {
    try {
        const recipientData = {
            ...req.body,
            userId: req.user.id
        };
        
        const recipient = new Recipient(recipientData);
        await recipient.save();
        
        res.status(201).json({
            success: true,
            message: 'Recipient created successfully',
            recipient
        });
    } catch (error) {
        console.error('Error creating recipient:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating recipient'
        });
    }
});

// Get all recipients
app.get('/api/recipients', authenticate, async (req, res) => {
    try {
        const recipients = await Recipient.find({ userId: req.user.id });
        res.json({
            success: true,
            recipients
        });
    } catch (error) {
        console.error('Error fetching recipients:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recipients'
        });
    }
});

// ============= SHIPMENT ROUTES (UPDATED) =============

// Create new shipment with references
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

        // Create or find sender
        let sender = await Sender.findOne({ 
            phone: data.senderPhone,
            userId: req.user.id 
        });
        
        if (!sender) {
            sender = new Sender({
                userId: req.user.id,
                name: data.senderName,
                email: data.senderEmail,
                phone: data.senderPhone,
                address: data.senderAddress
            });
            await sender.save();
        }

        // Create or find recipient
        let recipient = await Recipient.findOne({ 
            phone: data.recipientPhone,
            userId: req.user.id 
        });
        
        if (!recipient) {
            recipient = new Recipient({
                userId: req.user.id,
                name: data.recipientName,
                email: data.recipientEmail,
                phone: data.recipientPhone,
                address: data.deliveryAddress
            });
            await recipient.save();
        }

        // Create shipment with references
        const shipmentData = {
            trackingNumber: trackingNumber,
            
            // References
            senderId: sender._id,
            recipientId: recipient._id,
            createdBy: req.user.id,
            
            // Shipment Information
            origin: data.origin || '',
            destination: data.destination || '',
            carrier: data.carrier || '',
            shipmentType: data.shipmentType || 'ROAD',
            
            // Package Details
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
            
            // Payment
            paymentMode: data.paymentMode || 'cash',
            freightCost: data.freightCost || 0,
            
            // Dates
            expectedDelivery: data.expectedDelivery || '',
            departureDate: data.departureDate || '',
            pickupDate: data.pickupDate || '',
            
            // Status
            status: data.status || 'pending',
            
            // Remarks
            remark: data.comment || '',
            comment: data.comment || '',
            
            // Tracking History
            trackingHistory: [{
                status: data.status || 'pending',
                location: data.origin || 'Origin',
                message: 'Shipment created',
                remark: data.comment || 'Initial shipment registration',
                timestamp: new Date()
            }],
            
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const shipment = new Shipment(shipmentData);
        await shipment.save();
        
        // Create additional details if provided
        if (data.additionalDetails) {
            const shipmentDetail = new ShipmentDetail({
                shipmentId: shipment._id,
                details: data.additionalDetails
            });
            await shipmentDetail.save();
        }
        
        console.log('✅ SHIPMENT SAVED SUCCESSFULLY!');
        console.log('Saved tracking:', shipment.trackingNumber);

        // Populate sender and recipient for response
        await shipment.populate('senderId recipientId');

        res.status(201).json({ 
            success: true,
            message: 'Shipment created successfully', 
            trackingNumber: shipment.trackingNumber,
            shipmentId: shipment._id,
            shipment: shipment
        });

    } catch (error) {
        console.error('❌ ERROR SAVING SHIPMENT:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error creating shipment: ' + error.message 
        });
    }
});

// Get all shipments with populated data
app.get('/api/admin/shipments', authenticate, isAdmin, async (req, res) => {
    try {
        const shipments = await Shipment.find()
            .populate('senderId')
            .populate('recipientId')
            .populate('createdBy', 'name username')
            .sort({ createdAt: -1 });
            
        console.log(`📋 Found ${shipments.length} shipments`);
        
        // Transform data for frontend
        const transformedShipments = shipments.map(s => ({
            ...s.toObject(),
            senderName: s.senderId?.name || 'N/A',
            senderEmail: s.senderId?.email || 'N/A',
            senderPhone: s.senderId?.phone || 'N/A',
            senderAddress: s.senderId?.address || 'N/A',
            recipientName: s.recipientId?.name || 'N/A',
            recipientEmail: s.recipientId?.email || 'N/A',
            recipientPhone: s.recipientId?.phone || 'N/A',
            deliveryAddress: s.recipientId?.address || 'N/A'
        }));
        
        res.json({
            success: true,
            shipments: transformedShipments
        });
    } catch (error) {
        console.error('Error fetching shipments:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching shipments' 
        });
    }
});

// Get single shipment by ID with populated data
app.get('/api/admin/shipments/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const shipment = await Shipment.findById(req.params.id)
            .populate('senderId')
            .populate('recipientId')
            .populate('createdBy', 'name username');
            
        if (!shipment) {
            return res.status(404).json({ 
                success: false,
                message: 'Shipment not found' 
            });
        }
        
        // Transform data for frontend
        const transformedShipment = {
            ...shipment.toObject(),
            senderName: shipment.senderId?.name || 'N/A',
            senderEmail: shipment.senderId?.email || 'N/A',
            senderPhone: shipment.senderId?.phone || 'N/A',
            senderAddress: shipment.senderId?.address || 'N/A',
            recipientName: shipment.recipientId?.name || 'N/A',
            recipientEmail: shipment.recipientId?.email || 'N/A',
            recipientPhone: shipment.recipientId?.phone || 'N/A',
            deliveryAddress: shipment.recipientId?.address || 'N/A'
        };
        
        res.json({
            success: true,
            shipment: transformedShipment
        });
    } catch (error) {
        console.error('Error fetching shipment:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching shipment' 
        });
    }
});

// Update shipment status
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
        
        // Also delete related shipment details
        await ShipmentDetail.deleteMany({ shipmentId: req.params.id });
        
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
        const totalSenders = await Sender.countDocuments();
        const totalRecipients = await Recipient.countDocuments();
        
        const recentShipments = await Shipment.find()
            .populate('senderId')
            .populate('recipientId')
            .sort({ createdAt: -1 })
            .limit(5);
            
        // Transform recent shipments
        const transformedRecent = recentShipments.map(s => ({
            ...s.toObject(),
            senderName: s.senderId?.name || 'N/A',
            recipientName: s.recipientId?.name || 'N/A'
        }));

        res.json({
            success: true,
            totalShipments,
            activeShipments,
            deliveredShipments,
            pendingShipments,
            totalUsers,
            adminUsers,
            totalSenders,
            totalRecipients,
            recentShipments: transformedRecent
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching stats' 
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

// ============= DEBUG ROUTES =============

app.get('/api/debug/collections', authenticate, isAdmin, async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const stats = {
            users: await User.countDocuments(),
            senders: await Sender.countDocuments(),
            recipients: await Recipient.countDocuments(),
            shipments: await Shipment.countDocuments(),
            shipmentDetails: await ShipmentDetail.countDocuments()
        };
        
        res.json({
            success: true,
            collections: collections.map(c => c.name),
            counts: stats
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
    console.log(`👤 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`📦 New Collections: Senders, Recipients, ShipmentDetails`);
    console.log(`🔍 Debug: http://localhost:${PORT}/api/debug/collections\n`);
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