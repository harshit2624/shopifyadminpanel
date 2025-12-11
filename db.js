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


async function getFacebookEvents() {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('facebook_events');
        const events = await collection.find({}).sort({ timestamp: -1 }).toArray();
        return events;
    } catch (error) {
        console.error('Error fetching Facebook events:', error);
        // Return empty array instead of throwing to prevent page crashes
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
    getFacebookEvents
};
