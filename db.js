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
            throw new Error('MONGODB_URI environment variable is not set.');
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
            throw error; // Re-throw the error to stop the application from proceeding without a DB
        }
    }
    return db; // This should be outside the if block to always return the db object
}

async function getCommissionPercentage() {
    const db = await connectToDatabase();
    const collection = db.collection('settings');
    const doc = await collection.findOne({ key: 'commissionPercentage' });
    return doc ? doc.value : 10; // Default to 10%
}

async function setCommissionPercentage(percentage) {
    const db = await connectToDatabase();
    const collection = db.collection('settings');
    await collection.updateOne(
        { key: 'commissionPercentage' },
        { $set: { value: percentage } },
        { upsert: true }
    );
}

async function getProductViewCount(productId) {
    const db = await connectToDatabase();
    const collection = db.collection('productViews');
    const doc = await collection.findOne({ productId });
    return doc ? doc.views : 0;
}

async function incrementProductViewCount(productId) {
    const db = await connectToDatabase();
    const collection = db.collection('productViews');
    await collection.updateOne(
        { productId },
        { $inc: { views: 1 } },
        { upsert: true }
    );
}

async function getAllProductViewCounts() {
    const db = await connectToDatabase();
    const collection = db.collection('productViews');
    const docs = await collection.find({}).toArray();
    const viewCounts = {};
    docs.forEach(doc => {
        viewCounts[doc.productId] = doc.views;
    });
    return viewCounts;
}

module.exports = {
    connectToDatabase,
    getCommissionPercentage,
    setCommissionPercentage,
    getProductViewCount,
    incrementProductViewCount,
    getAllProductViewCounts
};
