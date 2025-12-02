const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { URL } = require('url');
const { getCommissionPercentage, setCommissionPercentage, incrementProductViewCount, getAllProductViewCounts } = require('./db');

// --- Configuration ---
// Load environment variables from a .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const SHOP = process.env.SHOPIFY_SHOP_NAME;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

// In-memory store for the commission percentage
let commissionPercentage = 10; // Default commission percentage
const productViewCounts = {}; // In-memory store for product view counts

// --- Shopify API Service ---
function fetchShopifyProducts(callback) {
    const options = {
        hostname: `${SHOP}.myshopify.com`,
        path: '/admin/api/2024-04/products.json',
        method: 'GET',
        headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const products = JSON.parse(data).products;
                const productImages = {};
                const productTitles = {};
                products.forEach(product => {
                    if (product.image) {
                        productImages[product.id] = product.image.src;
                    }
                    productTitles[product.id] = product.title;
                });
                callback(null, {productImages, productTitles});
            } else {
                callback(new Error(`Shopify API responded with status code ${res.statusCode}: ${data}`), null);
            }
        });
    });

    req.on('error', (error) => {
        callback(error, null);
    });

    req.end();
}

function fetchShopifyOrders(callback) {
    const options = {
        hostname: `${SHOP}.myshopify.com`,
        path: '/admin/api/2024-04/orders.json',
        method: 'GET',
        headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                callback(null, JSON.parse(data));
            } else {
                callback(new Error(`Shopify API responded with status code ${res.statusCode}: ${data}`), null);
            }
        });
    });

    req.on('error', (error) => {
        callback(error, null);
    });

    req.end();
}

function calculateTopSellingProducts(orders, productImages) {
    const productCounts = {};
    orders.forEach(order => {
        order.line_items.forEach(item => {
            if (productCounts[item.title]) {
                productCounts[item.title].quantity += item.quantity;
            } else {
                productCounts[item.title] = {
                    quantity: item.quantity,
                    image: productImages[item.product_id]
                };
            }
        });
    });

    const sortedProducts = Object.keys(productCounts).map(title => {
        return {
            title: title,
            quantity: productCounts[title].quantity,
            image: productCounts[title].image
        };
    });

    sortedProducts.sort((a, b) => b.quantity - a.quantity);

    return sortedProducts;
}

function calculateMostViewedProducts(viewCounts, productImages, productTitles) {
    const sortedProducts = Object.keys(viewCounts).map(productId => {
        return {
            id: productId,
            title: productTitles[productId],
            views: viewCounts[productId],
            image: productImages[productId]
        };
    });

    sortedProducts.sort((a, b) => b.views - a.views);

    return sortedProducts;
}


// --- View Renderer ---
function renderView(res, templatePath, data, commissionPercentage) {
    fs.readFile(templatePath, 'utf8', (err, template) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error: Could not read template file.');
            return;
        }

        // Replace placeholders
        let content = template.replace('{{commissionPercentage}}', commissionPercentage);
        
        if (data.orders) {
            const ordersHtml = data.orders.map(order => {
                const commission = (parseFloat(order.total_price) * (commissionPercentage / 100)).toFixed(2);
                return `<tr>
                    <td>#${order.order_number}</td>
                    <td>${new Date(order.created_at).toLocaleDateString()}</td>
                    <td>$${order.total_price}</td>
                    <td>$${commission}</td>
                </tr>`;
            }).join('');
            content = content.replace('{{ordersTable}}', ordersHtml);
        } else if (template.includes('{{ordersTable}}')) {
            content = content.replace('{{ordersTable}}', '<tr><td colspan="4">Could not fetch orders. Check your credentials and permissions.</td></tr>');
        }

        if (data.topSellingProducts) {
            const productsHtml = data.topSellingProducts.map(product => {
                return `<tr>
                    <td><img src="${product.image}" alt="${product.title}" width="50"></td>
                    <td>${product.title}</td>
                    <td>${product.quantity}</td>
                </tr>`;
            }).join('');
            content = content.replace('{{topSellingProducts}}', productsHtml);
        } else if (template.includes('{{topSellingProducts}}')) {
            content = content.replace('{{topSellingProducts}}', '<tr><td colspan="3">No data available.</td></tr>');
        }

        if (data.mostViewedProducts) {
            const productsHtml = data.mostViewedProducts.map(product => {
                return `<tr>
                    <td><img src="${product.image}" alt="${product.title}" width="50"></td>
                    <td>${product.title}</td>
                    <td>${product.views}</td>
                </tr>`;
            }).join('');
            content = content.replace('{{mostViewedProducts}}', productsHtml);
        } else if (template.includes('{{mostViewedProducts}}')) {
            content = content.replace('{{mostViewedProducts}}', '<tr><td colspan="3">No data available.</td></tr>');
        }
        
        if(data.error) {
             content = content.replace('{{errorMessage}}', `<p style="color: red;">Error: ${data.error}</p>`);
        } else {
            content = content.replace('{{errorMessage}}', '');
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
    });
}

// --- HTTP Server ---
const server = http.createServer((req, res) => {
    const templatePath = path.join(__dirname, 'views', 'index.html');

    // --- Handle POST request to set commission ---
    if (req.method === 'POST' && req.url === '/set-commission') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            const postData = querystring.parse(body);
            const newPercentage = parseFloat(postData.percentage);
            if (!isNaN(newPercentage) && newPercentage >= 0) {
                await setCommissionPercentage(newPercentage);
            }
            // Redirect back to the homepage
            res.writeHead(302, { 'Location': '/' });
            res.end();
        });
    }
    // --- Handle POST request to track product view ---
    else if (req.method === 'POST' && req.url.startsWith('/track-view')) {
        (async () => {
            const urlParams = new URL(req.url, `http://${req.headers.host}`);
            const productId = urlParams.searchParams.get('product_id');
            if (productId) {
                await incrementProductViewCount(productId);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        })();
    }
    // --- Handle GET request for the main page ---
    else if (req.method === 'GET' && req.url === '/') {
        (async () => {
            try {
                const commissionPercentage = await getCommissionPercentage();
                fetchShopifyOrders((err, data) => {
                    if (err) {
                        console.error(err);
                        renderView(res, templatePath, { error: err.message }, commissionPercentage);
                        return;
                    }
                    renderView(res, templatePath, data, commissionPercentage);
                });
            } catch (error) {
                console.error(error);
                renderView(res, templatePath, { error: 'Database error' }, 10);
            }
        })();
    }
    // --- Handle GET request for the analytics page ---
    else if (req.method === 'GET' && req.url === '/analytics') {
        (async () => {
            try {
                const productViewCounts = await getAllProductViewCounts();
                fetchShopifyProducts((err, productData) => {
                    if (err) {
                        console.error(err);
                        renderView(res, path.join(__dirname, 'views', 'analytics.html'), { error: err.message }, 10);
                        return;
                    }
                    fetchShopifyOrders((err, orderData) => {
                        if (err) {
                            console.error(err);
                            renderView(res, path.join(__dirname, 'views', 'analytics.html'), { error: err.message }, 10);
                            return;
                        }
                        const topSellingProducts = calculateTopSellingProducts(orderData.orders, productData.productImages);
                        const mostViewedProducts = calculateMostViewedProducts(productViewCounts, productData.productImages, productData.productTitles);
                        renderView(res, path.join(__dirname, 'views', 'analytics.html'), { topSellingProducts, mostViewedProducts }, 10);
                    });
                });
            } catch (error) {
                console.error(error);
                renderView(res, path.join(__dirname, 'views', 'analytics.html'), { error: 'Database error' }, 10);
            }
        })();
    }
    // --- Handle 404 Not Found ---
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser.`);
});