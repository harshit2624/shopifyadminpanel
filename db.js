const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://workspace4626_db_user:fYRAgMwCZ4OKhj9g@cluster0.ookgvgu.mongodb.net/';
const DB_NAME = 'shopify_commission_app';

let client;
let db;

async function connectToDatabase() {
    if (!client) {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('Connected to MongoDB');
    }
    return db;
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
