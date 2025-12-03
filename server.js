// --- Configuration ---
// Use dotenv to load environment variables from a .env file locally.
// This MUST be the first line of code to ensure all modules have access to the variables.
require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { URL } = require('url');
const { getCommissionPercentage, setCommissionPercentage, incrementProductViewCount, getAllProductViewCounts } = require('./db');

const SHOP = process.env.SHOPIFY_SHOP_NAME;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

// --- Shopify API Service ---
/**
 * Generic function to make requests to the Shopify API.
 * @param {string} apiPath - The API path (e.g., '/admin/api/2024-04/products.json').
 * @returns {Promise<object>} - A promise that resolves with the JSON response.
 */
function fetchFromShopify(apiPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: `${SHOP}.myshopify.com`,
            path: apiPath,
            method: 'GET',
            // Enforce TLS 1.2 to prevent handshake errors with Shopify's API
            secureProtocol: 'TLSv1_2_method',
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Failed to parse Shopify response.'));
                    }
                } else {
                    reject(new Error(`Shopify API responded with status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.end();
    });
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
const server = http.createServer(async (req, res) => {
    const templatePath = path.join(__dirname, 'views', 'index.html');

    // --- Handle POST request to set commission ---
    if (req.method === 'POST' && req.url === '/set-commission') { // No async needed here, but kept in async server
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
    else if (req.method === 'POST' && req.url.startsWith('/track-view')) { // Async logic
        try {
            const urlParams = new URL(req.url, `http://${req.headers.host}`);
            const productId = urlParams.searchParams.get('product_id');
            if (productId) {
                await incrementProductViewCount(productId);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('Error tracking view:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
        }
    }
    // --- Handle GET request for the main page ---
    else if (req.method === 'GET' && req.url === '/') {
        try {
            const commissionPercentage = await getCommissionPercentage();
            const orderData = await fetchFromShopify('/admin/api/2024-04/orders.json?status=any');
            renderView(res, templatePath, orderData, commissionPercentage);
        } catch (error) {
            console.error('Error fetching main page data:', error);
            // Attempt to render the page with an error message, using a default commission
            const commission = await getCommissionPercentage().catch(() => 10);
            renderView(res, templatePath, { error: error.message }, commission);
        }
    }
    // --- Handle GET request for the analytics page ---
    else if (req.method === 'GET' && req.url === '/analytics') {
        const analyticsTemplatePath = path.join(__dirname, 'views', 'analytics.html');
        try {
            // Fetch all data in parallel for better performance
            const [productViewCounts, productDataResponse, orderData] = await Promise.all([
                getAllProductViewCounts(),
                fetchFromShopify('/admin/api/2024-04/products.json'),
                fetchFromShopify('/admin/api/2024-04/orders.json?status=any')
            ]);

            const productImages = {};
            const productTitles = {};
            productDataResponse.products.forEach(p => {
                productImages[p.id] = p.image ? p.image.src : '';
                productTitles[p.id] = p.title;
            });

            const topSellingProducts = calculateTopSellingProducts(orderData.orders, productImages);
            const mostViewedProducts = calculateMostViewedProducts(productViewCounts, productImages, productTitles);
            renderView(res, analyticsTemplatePath, { topSellingProducts, mostViewedProducts }, 10); // Commission not shown on this page
        } catch (error) {
            console.error('Error fetching analytics data:', error);
            renderView(res, analyticsTemplatePath, { error: error.message }, 10);
        }
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