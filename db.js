const { MongoClient } = require('mongodb');

// CRITICAL: Rely ONLY on the environment variable.
// This prevents accidentally exposing credentials in your code.
// If MONGODB_URI is not set in your environment (e.g., on Render), the app will fail loudly.
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'shopify_commission_app';

let client;
let db;


async function connectToDatabase() {
    if (!client) {
        if (!MONGODB_URI) {
            console.warn('MONGODB_URI environment variable is not set. Using fallback mode.');
            return null; // Return null instead of throwing
        }
        try {
            console.log('Attempting to connect to MongoDB...');
            client = new MongoClient(MONGODB_URI, {
                tls: true,
                tlsAllowInvalidCertificates: false,
                tlsAllowInvalidHostnames: false
            });
            await client.connect();
            db = client.db(DB_NAME);
            console.log('Successfully connected to MongoDB.');

            // Perform a test write to confirm permissions and create a test collection.
            const testCollection = db.collection('connection_test');
            await testCollection.updateOne({ test: 'ping' }, { $set: { timestamp: new Date() } }, { upsert: true });
            console.log('Successfully performed a test write to the database.');
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            console.warn('MongoDB connection failed. App will run in fallback mode with limited functionality.');
            db = null; // Set db to null to indicate no connection
        }
    }
    return db; // This should be outside the if block to always return the db object (may be null)
}


async function getCommissionPercentage() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, using default commission percentage');
            return 10; // Default to 10%
        }
        const collection = db.collection('settings');
        const doc = await collection.findOne({ key: 'commissionPercentage' });
        return doc ? doc.value : 10; // Default to 10%
    } catch (error) {
        console.error('Error getting commission percentage:', error);
        return 10; // Default to 10%
    }
}


async function setCommissionPercentage(percentage) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, cannot set commission percentage');
            return;
        }
        const collection = db.collection('settings');
        await collection.updateOne(
            { key: 'commissionPercentage' },
            { $set: { value: percentage } },
            { upsert: true }
        );
    } catch (error) {
        console.error('Error setting commission percentage:', error);
    }
}


async function getProductViewCount(productId) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return 0;
        }
        const collection = db.collection('productViews');
        const doc = await collection.findOne({ productId });
        return doc ? doc.views : 0;
    } catch (error) {
        console.error('Error getting product view count:', error);
        return 0;
    }
}


async function incrementProductViewCount(productId) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, cannot increment view count');
            return;
        }
        const collection = db.collection('productViews');
        await collection.updateOne(
            { productId },
            { $inc: { views: 1 } },
            { upsert: true }
        );
    } catch (error) {
        console.error('Error incrementing product view count:', error);
    }
}


async function getAllProductViewCounts() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return {};
        }
        const collection = db.collection('productViews');
        const docs = await collection.find({}).toArray();
        const viewCounts = {};
        docs.forEach(doc => {
            viewCounts[doc.productId] = doc.views;
        });
        return viewCounts;
    } catch (error) {
        console.error('Error getting all product view counts:', error);
        return {};
    }
}


async function createVendor(vendorData) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            throw new Error('Database not connected');
        }
        const collection = db.collection('vendors');
        const result = await collection.insertOne(vendorData);
        return result;
    } catch (error) {
        console.error('Error creating vendor:', error);
        throw error;
    }
}


async function getVendors() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return [];
        }
        const collection = db.collection('vendors');
        return await collection.find({}).toArray();
    } catch (error) {
        console.error('Error getting vendors:', error);
        return [];
    }
}


async function getVendorById(vendorId) {
    try {
        const { ObjectId } = require('mongodb');
        const db = await connectToDatabase();
        if (!db) {
            return null;
        }
        const collection = db.collection('vendors');
        return await collection.findOne({ _id: new ObjectId(vendorId) });
    } catch (error) {
        console.error('Error getting vendor by ID:', error);
        return null;
    }
}


async function getProductsByVendor(vendorName) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return [];
        }
        const collection = db.collection('products');
        return await collection.find({ vendor: vendorName }).toArray();
    } catch (error) {
        console.error('Error getting products by vendor:', error);
        return [];
    }
}



async function trackFacebookEvent(eventData) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, cannot track Facebook event');
            return;
        }
        const collection = db.collection('facebook_events');
        await collection.insertOne(eventData);
    } catch (error) {
        console.error('Error tracking Facebook event:', error);
    }
}


async function getFacebookEvents(filters = {}) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, cannot fetch events.');
            return [];
        }

        const collection = db.collection('facebook_events');
        const query = {};

        // Filter by Event Type
        if (filters.eventType && filters.eventType !== 'all') {
            // The event name in the database corresponds to filters.eventType
            query.eventName = filters.eventType;
        }

        // Filter by Time Period
        if (filters.period && filters.period !== 'all') {
            const now = new Date();
            let startDate;

            switch (filters.period) {
                case 'today':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'last7days':
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    startDate = new Date(sevenDaysAgo.setHours(0, 0, 0, 0));
                    break;
                case 'mtd':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'custom':
                    if (filters.startDate) {
                        // The date from the input is already in UTC 'YYYY-MM-DD'
                        startDate = new Date(filters.startDate);
                    }
                    break;
            }

            if (startDate) {
                query.timestamp = { ...query.timestamp, $gte: startDate.toISOString() };
            }

            if (filters.period === 'custom' && filters.endDate) {
                // Set to the end of the selected day
                const endDate = new Date(filters.endDate);
                endDate.setHours(23, 59, 59, 999);
                query.timestamp = { ...query.timestamp, $lte: endDate.toISOString() };
            }
        }

        const events = await collection.find(query).sort({ timestamp: -1 }).toArray();
        return events;
    } catch (error) {
        console.error('Error fetching Facebook events:', error);
        return [];
    }
}

async function getTopFacebookEventsByProduct(eventName, filters = {}, limit = 30) {
    try {
        const db = await connectToDatabase();
        if (!db) return [];

        const collection = db.collection('facebook_events');
        
        const matchStage = { eventName: eventName };

        // Apply Time Period Filter from filters object
        if (filters.period && filters.period !== 'all') {
            const now = new Date();
            let startDate;

            switch (filters.period) {
                case 'today':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'last7days':
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    startDate = new Date(sevenDaysAgo.setHours(0, 0, 0, 0));
                    break;
                case 'mtd':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'custom':
                    if (filters.startDate) {
                        startDate = new Date(filters.startDate);
                    }
                    break;
            }

            if (startDate) {
                matchStage.timestamp = { $gte: startDate.toISOString() };
            }

            if (filters.period === 'custom' && filters.endDate) {
                const endDate = new Date(filters.endDate);
                endDate.setHours(23, 59, 59, 999);
                matchStage.timestamp = { ...matchStage.timestamp, $lte: endDate.toISOString() };
            }
        }

        const pipeline = [
            { $match: matchStage },
            { $group: { _id: '$productId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
            { $project: { productId: '$_id', count: 1, _id: 0 } }
        ];

        const results = await collection.aggregate(pipeline).toArray();
        return results;
    } catch (error) {
        console.error(`Error getting top events for ${eventName}:`, error);
        return [];
    }
}

async function getFacebookEventCounts(filters = {}) {
    try {
        const db = await connectToDatabase();
        if (!db) return {};

        const collection = db.collection('facebook_events');
        
        const matchStage = {};

        // Time Period Filter from filters object
        if (filters.period && filters.period !== 'all') {
            const now = new Date();
            let startDate;

            switch (filters.period) {
                case 'today':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'last7days':
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    startDate = new Date(sevenDaysAgo.setHours(0, 0, 0, 0));
                    break;
                case 'mtd':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'custom':
                    if (filters.startDate) {
                        startDate = new Date(filters.startDate);
                    }
                    break;
            }

            if (startDate) {
                matchStage.timestamp = { $gte: startDate.toISOString() };
            }

            if (filters.period === 'custom' && filters.endDate) {
                const endDate = new Date(filters.endDate);
                endDate.setHours(23, 59, 59, 999);
                matchStage.timestamp = { ...matchStage.timestamp, $lte: endDate.toISOString() };
            }
        }

        const pipeline = [
            { $match: matchStage },
            { $group: { _id: '$eventName', count: { $sum: 1 } } }
        ];

        const results = await collection.aggregate(pipeline).toArray();

        // Convert the result array to a more useful object/map
        const counts = results.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});

        return counts;
    } catch (error) {
        console.error('Error getting Facebook event counts:', error);
        return {};
    }
}

async function createCroscrowVendor(vendorData) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            throw new Error('Database not connected');
        }
        const collection = db.collection('croscrow_vendors');
        const result = await collection.insertOne(vendorData);
        return result;
    } catch (error) {
        console.error('Error creating croscrow vendor:', error);
        throw error;
    }
}


async function getCroscrowVendors() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return [];
        }
        const collection = db.collection('croscrow_vendors');
        return await collection.find({}).toArray();
    } catch (error) {
        console.error('Error getting croscrow vendors:', error);
        return [];
    }
}

async function getCroscrowVendorById(vendorId) {
    try {
        const {
            ObjectId
        } = require('mongodb');
        const db = await connectToDatabase();
        if (!db) {
            return null;
        }
        const collection = db.collection('croscrow_vendors');
        return await collection.findOne({
            _id: new ObjectId(vendorId)
        });
    } catch (error) {
        console.error('Error getting croscrow vendor by ID:', error);
        return null;
    }
}

async function updateCroscrowVendor(vendorId, vendorData) {
    try {
        const {
            ObjectId
        } = require('mongodb');
        const db = await connectToDatabase();
        if (!db) {
            throw new Error('Database not connected');
        }
        const collection = db.collection('croscrow_vendors');
        const result = await collection.updateOne({
            _id: new ObjectId(vendorId)
        }, {
            $set: vendorData
        });
        return result;
    } catch (error) {
        console.error('Error updating croscrow vendor:', error);
        throw error;
    }
}

async function getCommissionOrders() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return [];
        }
        const collection = db.collection('commission_orders');
        return await collection.find({}).toArray();
    } catch (error) {
        console.error('Error getting commission orders:', error);
        return [];
    }
}

async function saveCommissionOrder(order) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            throw new Error('Database not connected');
        }
        const collection = db.collection('commission_orders');
        // Use order_id which is the shopify order id
        const result = await collection.updateOne({ order_id: order.order_id }, { $set: order }, { upsert: true });
        return result;
    } catch (error) {
        console.error('Error saving commission order:', error);
        throw error;
    }
}

async function getCroscrowSettings() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, using default settings');
            return {}; // Default to empty object
        }
        const collection = db.collection('settings');
        const doc = await collection.findOne({ key: 'croscrowDetails' });
        return doc ? doc.value : {}; // Default to empty object
    } catch (error) {
        console.error('Error getting Croscrow settings:', error);
        return {}; // Default to empty object
    }
}

async function setCroscrowSettings(settings) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            console.warn('Database not connected, cannot set Croscrow settings');
            return;
        }
        const collection = db.collection('settings');
        await collection.updateOne(
            { key: 'croscrowDetails' },
            { $set: { value: settings } },
            { upsert: true }
        );
    } catch (error) {
        console.error('Error setting Croscrow settings:', error);
    }
}

async function saveManualOrder(order) {
    try {
        const db = await connectToDatabase();
        if (!db) {
            throw new Error('Database not connected');
        }
        const collection = db.collection('manual_orders');
        const result = await collection.insertOne(order);
        return result;
    } catch (error) {
        console.error('Error saving manual order:', error);
        throw error;
    }
}

async function getManualOrders() {
    try {
        const db = await connectToDatabase();
        if (!db) {
            return [];
        }
        const collection = db.collection('manual_orders');
        return await collection.find({}).toArray();
    } catch (error) {
        console.error('Error getting manual orders:', error);
        return [];
    }
}

module.exports = {
    connectToDatabase,
    getCommissionPercentage,
    setCommissionPercentage,
    getProductViewCount,
    incrementProductViewCount,
    getAllProductViewCounts,
    createVendor,
    getVendors,
    getVendorById,
    getProductsByVendor,
    trackFacebookEvent,
    getFacebookEvents,
    getTopFacebookEventsByProduct,
    getFacebookEventCounts,
    createCroscrowVendor,
    getCroscrowVendors,
    getCroscrowVendorById,
    updateCroscrowVendor,
    getCommissionOrders,
    saveCommissionOrder,
    getCroscrowSettings,
    setCroscrowSettings,
    saveManualOrder,
    getManualOrders,
};
