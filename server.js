import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 4000;

// Very permissive CORS
app.use(cors({
    origin: '*',
    methods: '*',
    allowedHeaders: '*',
    credentials: true
}));

app.use(express.json());

// Simple User Model
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    cartData: { type: Object, default: {} }
}, { minimize: false, timestamps: true });

const User = mongoose.model('User', userSchema);

// Simple Food Model
const foodSchema = new mongoose.Schema({
    name: String,
    description: String,
    price: Number,
    image: String,
    category: String,
    isAvailable: { type: Boolean, default: true }
}, { timestamps: true });

const Food = mongoose.model('Food', foodSchema);

// Simple Order Model
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderNumber: { type: String, unique: true },
    items: [{
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food' },
        name: String,
        price: Number,
        quantity: Number,
        image: String
    }],
    amount: { type: Number, required: true },
    deliveryFee: { type: Number, default: 2 },
    totalAmount: { type: Number, required: true },
    address: {
        firstName: String,
        lastName: String,
        email: String,
        street: String,
        city: String,
        state: String,
        zipcode: String,
        country: String,
        phone: String
    },
    status: {
        type: String,
        enum: ['Food Processing', 'Confirmed', 'Preparing', 'Out for delivery', 'Delivered', 'Cancelled'],
        default: 'Food Processing'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed'],
        default: 'Pending'
    },
    paymentId: String
}, { timestamps: true });

// Generate order number before saving
orderSchema.pre('save', async function (next) {
    if (this.isNew && !this.orderNumber) {
        const count = await this.constructor.countDocuments();
        this.orderNumber = `ORD-${Date.now()}-${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);

// Helper function
const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
};

// Routes
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Food Delivery API is running!',
        endpoints: {
            // Food endpoints
            'GET /api/food/list': 'Get all food items',
            'GET /api/food/categories': 'Get food categories',

            // User endpoints
            'POST /api/user/register': 'Register new user',
            'POST /api/user/login': 'Login user',

            // Cart endpoints (require authentication)
            'POST /api/cart/add': 'Add item to cart',
            'POST /api/cart/remove': 'Remove item from cart',
            'POST /api/cart/get': 'Get cart contents',
            'DELETE /api/cart/clear': 'Clear cart',

            // Order endpoints (require authentication)
            'POST /api/order/place': 'Place order from cart with delivery address',
            'POST /api/order/userorders': 'Get user order history with pagination'
        },
        note: 'Cart and Order endpoints require authentication token in headers'
    });
});

// Food routes
app.get('/api/food/list', async (req, res) => {
    try {
        console.log('📋 Food list request received');

        let foods = await Food.find({});

        // If no foods in database, create sample data
        if (foods.length === 0) {
            console.log('No foods found, creating sample data...');

            const sampleFoods = [
                {
                    name: 'Margherita Pizza',
                    description: 'Classic pizza with tomato sauce and mozzarella cheese',
                    price: 12.99,
                    category: 'Pizza',
                    image: 'pizza1.jpg',
                    isAvailable: true
                },
                {
                    name: 'Caesar Salad',
                    description: 'Fresh romaine lettuce with caesar dressing and croutons',
                    price: 8.99,
                    category: 'Salad',
                    image: 'salad1.jpg',
                    isAvailable: true
                },
                {
                    name: 'Chicken Sandwich',
                    description: 'Grilled chicken breast with lettuce and tomato',
                    price: 10.99,
                    category: 'Sandwich',
                    image: 'sandwich1.jpg',
                    isAvailable: true
                }
            ];

            foods = await Food.insertMany(sampleFoods);
            console.log('✅ Sample foods created');
        }

        console.log(`📊 Returning ${foods.length} food items`);

        res.json({
            success: true,
            data: foods,
            message: `Found ${foods.length} food items`
        });
    } catch (error) {
        console.error('❌ Food list error:', error);

        // Fallback response
        res.json({
            success: true,
            data: [
                {
                    _id: 'sample1',
                    name: 'Sample Pizza',
                    description: 'This is a sample pizza (database error)',
                    price: 12.99,
                    category: 'Pizza',
                    image: 'sample.jpg',
                    isAvailable: true
                }
            ],
            message: 'Fallback data due to database error'
        });
    }
});

app.get('/api/food/categories', (req, res) => {
    res.json({
        success: true,
        data: ['Salad', 'Rolls', 'Deserts', 'Sandwich', 'Cake', 'Pure Veg', 'Pasta', 'Noodles', 'Pizza']
    });
});

// Auth middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.token || req.headers.authorization;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        req.user = user;
        req.body.userId = user._id.toString();
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Cart routes
app.post('/api/cart/add', authMiddleware, async (req, res) => {
    try {
        console.log('🛒 Add to cart request:', req.body);

        const { itemId, quantity = 1 } = req.body;
        const userId = req.body.userId;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update cart
        let cartData = user.cartData || {};
        if (cartData[itemId]) {
            cartData[itemId] += quantity;
        } else {
            cartData[itemId] = quantity;
        }

        // Save to database
        await User.findByIdAndUpdate(userId, { cartData });

        console.log('✅ Item added to cart');

        res.json({
            success: true,
            message: 'Item added to cart',
            data: {
                itemId,
                quantity: cartData[itemId]
            }
        });
    } catch (error) {
        console.error('❌ Add to cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart'
        });
    }
});

app.post('/api/cart/remove', authMiddleware, async (req, res) => {
    try {
        console.log('🗑️ Remove from cart request:', req.body);

        const { itemId, quantity = 1 } = req.body;
        const userId = req.body.userId;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update cart
        let cartData = user.cartData || {};
        if (cartData[itemId]) {
            cartData[itemId] -= quantity;
            if (cartData[itemId] <= 0) {
                delete cartData[itemId];
            }
        }

        // Save to database
        await User.findByIdAndUpdate(userId, { cartData });

        console.log('✅ Item removed from cart');

        res.json({
            success: true,
            message: 'Item removed from cart',
            data: {
                itemId,
                quantity: cartData[itemId] || 0
            }
        });
    } catch (error) {
        console.error('❌ Remove from cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove item from cart'
        });
    }
});

app.post('/api/cart/get', authMiddleware, async (req, res) => {
    try {
        console.log('📋 Get cart request for user:', req.body.userId);

        const userId = req.body.userId;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const cartData = user.cartData || {};
        const cartItems = [];
        let totalAmount = 0;
        let totalItems = 0;

        // Get food details for each cart item
        for (const [itemId, quantity] of Object.entries(cartData)) {
            if (quantity > 0) {
                try {
                    const foodItem = await Food.findById(itemId);
                    if (foodItem) {
                        const itemTotal = foodItem.price * quantity;
                        cartItems.push({
                            _id: foodItem._id,
                            name: foodItem.name,
                            description: foodItem.description,
                            price: foodItem.price,
                            image: foodItem.image,
                            category: foodItem.category,
                            quantity: quantity,
                            total: itemTotal,
                            isAvailable: foodItem.isAvailable
                        });
                        totalAmount += itemTotal;
                        totalItems += quantity;
                    }
                } catch (err) {
                    console.log('Food item not found:', itemId);
                }
            }
        }

        console.log(`✅ Cart retrieved: ${cartItems.length} items, total: $${totalAmount}`);

        res.json({
            success: true,
            data: {
                items: cartItems,
                summary: {
                    itemCount: cartItems.length,
                    totalItems,
                    totalAmount,
                    deliveryFee: totalAmount > 0 ? 2 : 0,
                    finalAmount: totalAmount > 0 ? totalAmount + 2 : 0
                }
            }
        });
    } catch (error) {
        console.error('❌ Get cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get cart data'
        });
    }
});

app.delete('/api/cart/clear', authMiddleware, async (req, res) => {
    try {
        console.log('🧹 Clear cart request for user:', req.body.userId);

        const userId = req.body.userId;

        // Clear cart
        await User.findByIdAndUpdate(userId, { cartData: {} });

        console.log('✅ Cart cleared');

        res.json({
            success: true,
            message: 'Cart cleared successfully'
        });
    } catch (error) {
        console.error('❌ Clear cart error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear cart'
        });
    }
});

// Order routes
app.post('/api/order/place', authMiddleware, async (req, res) => {
    try {
        console.log('📦 Place order request:', req.body);

        const { address, paymentId } = req.body;
        const userId = req.body.userId;

        // Validate required address fields
        if (!address || !address.firstName || !address.lastName || !address.email ||
            !address.street || !address.city || !address.state || !address.zipcode ||
            !address.country || !address.phone) {
            console.log('❌ Address validation failed. Received address:', address);
            return res.status(400).json({
                success: false,
                message: 'Complete delivery address is required',
                missingFields: {
                    firstName: !address?.firstName,
                    lastName: !address?.lastName,
                    email: !address?.email,
                    street: !address?.street,
                    city: !address?.city,
                    state: !address?.state,
                    zipcode: !address?.zipcode,
                    country: !address?.country,
                    phone: !address?.phone
                }
            });
        }

        // Get user and cart data
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const cartData = user.cartData || {};
        const cartItems = Object.entries(cartData).filter(([_, quantity]) => quantity > 0);

        if (cartItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Build order items with current prices
        const orderItems = [];
        let subtotal = 0;

        for (const [itemId, quantity] of cartItems) {
            const foodItem = await Food.findById(itemId);
            if (!foodItem) {
                return res.status(400).json({
                    success: false,
                    message: `Food item not found: ${itemId}`
                });
            }

            if (!foodItem.isAvailable) {
                return res.status(400).json({
                    success: false,
                    message: `Food item is no longer available: ${foodItem.name}`
                });
            }

            const itemTotal = foodItem.price * quantity;
            subtotal += itemTotal;

            orderItems.push({
                foodId: foodItem._id,
                name: foodItem.name,
                price: foodItem.price,
                quantity: quantity,
                image: foodItem.image
            });
        }

        const deliveryFee = 2;
        const totalAmount = subtotal + deliveryFee;

        // Create order
        const order = new Order({
            userId: userId,
            items: orderItems,
            amount: subtotal,
            deliveryFee: deliveryFee,
            totalAmount: totalAmount,
            address: address,
            status: 'Food Processing',
            paymentStatus: 'Pending',
            paymentId: paymentId || null
        });

        await order.save();

        // Clear user's cart
        await User.findByIdAndUpdate(userId, { cartData: {} });

        console.log('✅ Order placed successfully:', order.orderNumber);

        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            data: {
                orderId: order._id,
                orderNumber: order.orderNumber,
                totalAmount: order.totalAmount,
                status: order.status,
                estimatedDelivery: '30-45 minutes',
                items: orderItems,
                address: address
            }
        });
    } catch (error) {
        console.error('❌ Place order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to place order: ' + error.message
        });
    }
});

app.post('/api/order/userorders', authMiddleware, async (req, res) => {
    try {
        console.log('📋 Get user orders request for user:', req.body.userId);

        const userId = req.body.userId;
        const { page = 1, limit = 10 } = req.body;

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get orders for user, sorted by creation date (newest first)
        const orders = await Order.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('items.foodId', 'name description category isAvailable');

        // Get total count for pagination
        const totalOrders = await Order.countDocuments({ userId });
        const totalPages = Math.ceil(totalOrders / limit);

        // Format orders for response
        const formattedOrders = orders.map(order => ({
            _id: order._id,
            orderNumber: order.orderNumber,
            items: order.items.map(item => ({
                _id: item.foodId?._id || item.foodId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image,
                total: item.price * item.quantity,
                isAvailable: item.foodId?.isAvailable || false
            })),
            amount: order.amount,
            deliveryFee: order.deliveryFee,
            totalAmount: order.totalAmount,
            address: order.address,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paymentId: order.paymentId,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        }));

        console.log(`✅ Retrieved ${orders.length} orders for user`);

        res.json({
            success: true,
            data: formattedOrders,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalOrders,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            message: orders.length > 0 ? `Found ${orders.length} orders` : 'No orders found'
        });
    } catch (error) {
        console.error('❌ Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get orders: ' + error.message
        });
    }
});

// User routes
app.post('/api/user/register', async (req, res) => {
    try {
        console.log('📝 Register request:', req.body);

        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            name,
            email,
            password: hashedPassword
        });

        await user.save();

        const token = createToken(user._id);

        console.log('✅ User registered:', email);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed: ' + error.message
        });
    }
});

app.post('/api/user/login', async (req, res) => {
    try {
        console.log('🔑 Login request:', req.body);

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = createToken(user._id);

        console.log('✅ User logged in:', email);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed: ' + error.message
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// Database connection and server start
const startServer = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log('📍 URI:', process.env.MONGODB_URI?.substring(0, 50) + '...');

        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Connected to MongoDB successfully');
        console.log('🗄️  Database:', mongoose.connection.name);

        app.listen(port, () => {
            console.log('');
            console.log('🚀 Server running on http://localhost:' + port);
            console.log('');
            console.log('📋 Available endpoints:');
            console.log('   GET  http://localhost:' + port + '/ (API info)');
            console.log('   GET  http://localhost:' + port + '/api/food/list');
            console.log('   GET  http://localhost:' + port + '/api/food/categories');
            console.log('   POST http://localhost:' + port + '/api/user/register');
            console.log('   POST http://localhost:' + port + '/api/user/login');
            console.log('   POST http://localhost:' + port + '/api/cart/add (auth required)');
            console.log('   POST http://localhost:' + port + '/api/cart/get (auth required)');
            console.log('   POST http://localhost:' + port + '/api/cart/remove (auth required)');
            console.log('');
            console.log('🧪 Test with curl:');
            console.log('   curl http://localhost:' + port + '/api/food/list');
            console.log('   curl http://localhost:' + port + '/api/food/categories');
            console.log('');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();