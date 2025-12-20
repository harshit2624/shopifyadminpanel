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

const { getCommissionPercentage, setCommissionPercentage, incrementProductViewCount, getAllProductViewCounts, createVendor, getVendors, getVendorById, trackFacebookEvent, getFacebookEvents, getTopFacebookEventsByProduct, getFacebookEventCounts, createCroscrowVendor, getCroscrowVendors, getCommissionOrders, saveCommissionOrder, getCroscrowVendorById, updateCroscrowVendor, getCroscrowSettings, setCroscrowSettings, saveManualOrder, getManualOrders } = require('./db');
const sanitizeHtml = require('sanitize-html');

const SHOP = process.env.SHOPIFY_SHOP_NAME;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

// --- Shopify API Service ---
/**
 * Generic function to make requests to the Shopify API.
 * @param {string} apiPath - The API path (e.g., '/admin/api/2024-04/products.json').
 * @returns {Promise<object>} - A promise that resolves with the JSON response.
 * @param {object} [credentials] - Optional credentials to use for the request.
 */
function fetchFromShopify(apiPath, credentials) {
    return new Promise((resolve, reject) => {
        let hostname;
        if (credentials) {
            // Strip any protocol and trailing slashes
            hostname = credentials.shopName
                .replace(/^(https?:\/\/)/, '')
                .replace(/\/$/, '');
            // If the hostname doesn't contain a dot, it's a shop name, not a custom domain.
            if (!hostname.includes('.')) {
                hostname = `${hostname}.myshopify.com`;
            }
        } else {
            hostname = `${SHOP}.myshopify.com`;
        }

        const options = {
            hostname: hostname,
            path: apiPath,
            method: 'GET',
            // Enforce TLS 1.2 to prevent handshake errors with Shopify's API
            secureProtocol: 'TLSv1_2_method',
            headers: {
                'X-Shopify-Access-Token': credentials ? credentials.accessToken : ACCESS_TOKEN,
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

/**
 * Generic function to POST data to the main Shopify store.
 * @param {string} apiPath - The API path (e.g., '/admin/api/2024-04/products.json').
 * @param {object} payload - The JSON payload to send.
 * @returns {Promise<object>} - A promise that resolves with the JSON response.
 */
function postToShopify(apiPath, payload) {
    console.log('--- POST to Shopify ---');
    console.log('Path:', apiPath);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('-----------------------');
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const options = {
            hostname: `${SHOP}.myshopify.com`,
            path: apiPath,
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (e) {
                        reject(new Error('Failed to parse Shopify POST response.'));
                    }
                } else {
                    try {
                        const errorJson = JSON.parse(responseData);
                        reject(new Error(`Shopify API POST responded with status ${res.statusCode}: ${JSON.stringify(errorJson)}`));
                    } catch (e) {
                        console.log('Shopify error response:', responseData);
                        reject(new Error(`Shopify API POST responded with status ${res.statusCode}: ${responseData}`));
                    }
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.write(data);
        req.end();
    });
}

function putToShopify(apiPath, payload) {
    console.log('--- PUT to Shopify ---');
    console.log('Path:', apiPath);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('-----------------------');
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const options = {
            hostname: `${SHOP}.myshopify.com`,
            path: apiPath,
            method: 'PUT',
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (e) {
                        reject(new Error('Failed to parse Shopify PUT response.'));
                    }
                } else {
                    try {
                        const errorJson = JSON.parse(responseData);
                        reject(new Error(`Shopify API PUT responded with status ${res.statusCode}: ${JSON.stringify(errorJson)}`));
                    } catch (e) {
                        reject(new Error(`Shopify API PUT responded with status ${res.statusCode}: ${responseData}`));
                    }
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.write(data);
        req.end();
    });
}

function postToVendorShopify(vendor, apiPath, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        let hostname = vendor.shopifyShopName
            .replace(/^(https?:\/\/)/, '')
            .replace(/\/$/, '');
        if (!hostname.includes('.')) {
            hostname = `${hostname}.myshopify.com`;
        }

        const options = {
            hostname: hostname,
            path: apiPath,
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': vendor.shopifyAccessToken,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (e) {
                        reject(new Error('Failed to parse vendor Shopify POST response.'));
                    }
                } else {
                    console.error(`Vendor Shopify API Error Response (Status: ${res.statusCode}):`);
                    console.error(responseData);
                    try {
                        const errorJson = JSON.parse(responseData);
                        reject(new Error(`Vendor Shopify API POST responded with status ${res.statusCode}: ${JSON.stringify(errorJson)}`));
                    } catch (e) {
                        reject(new Error(`Vendor Shopify API POST responded with status ${res.statusCode}: ${responseData}`));
                    }
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.write(data);
        req.end();
    });
}

async function fetchAllProducts(credentials) {
    let products = [];
    let apiPath = '/admin/api/2024-04/products.json?limit=250'; // Fetch 250 products per page

    while (apiPath) {
        const response = await new Promise((resolve, reject) => {
            let hostname;
            if (credentials) {
                hostname = credentials.shopName
                    .replace(/^(https?:\/\/)/, '')
                    .replace(/\/$/, '');
                if (!hostname.includes('.')) {
                    hostname = `${hostname}.myshopify.com`;
                }
            } else {
                hostname = `${SHOP}.myshopify.com`;
            }

            const options = {
                hostname: hostname,
                path: apiPath,
                method: 'GET',
                secureProtocol: 'TLSv1_2_method',
                headers: {
                    'X-Shopify-Access-Token': credentials ? credentials.accessToken : ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsedData = JSON.parse(data);
                            products = products.concat(parsedData.products);
                            const linkHeader = res.headers.link;
                            if (linkHeader) {
                                const links = linkHeader.split(',').reduce((acc, link) => {
                                    const match = link.match(/<(.+)>; rel="(.+)"/);
                                    if (match) {
                                        acc[match[2]] = match[1];
                                    }
                                    return acc;
                                }, {});
                                if (links.next) {
                                    // Extract the full path and query from the next link
                                    const nextUrl = new URL(links.next);
                                    apiPath = nextUrl.pathname + nextUrl.search;
                                } else {
                                    apiPath = null;
                                }
                            } else {
                                apiPath = null;
                            }
                            resolve();
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

    return { products };
}

async function fetchAllOrders(credentials) {
    let orders = [];
    let apiPath = '/admin/api/2024-04/orders.json?status=any&limit=250'; // Fetch 250 orders per page

    while (apiPath) {
        const response = await new Promise((resolve, reject) => {
            let hostname;
            if (credentials) {
                hostname = credentials.shopName
                    .replace(/^(https?:\/\/)/, '')
                    .replace(/\/$/, '');
                if (!hostname.includes('.')) {
                    hostname = `${hostname}.myshopify.com`;
                }
            } else {
                hostname = `${SHOP}.myshopify.com`;
            }

            const options = {
                hostname: hostname,
                path: apiPath,
                method: 'GET',
                secureProtocol: 'TLSv1_2_method',
                headers: {
                    'X-Shopify-Access-Token': credentials ? credentials.accessToken : ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsedData = JSON.parse(data);
                            orders = orders.concat(parsedData.orders);
                            const linkHeader = res.headers.link;
                            if (linkHeader) {
                                const links = linkHeader.split(',').reduce((acc, link) => {
                                    const match = link.match(/<(.+)>; rel="(.+)"/);
                                    if (match) {
                                        acc[match[2]] = match[1];
                                    }
                                    return acc;
                                }, {});
                                if (links.next) {
                                    // Extract the full path and query from the next link
                                    const nextUrl = new URL(links.next);
                                    apiPath = nextUrl.pathname + nextUrl.search;
                                } else {
                                    apiPath = null;
                                }
                            } else {
                                apiPath = null;
                            }
                            resolve();
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

    return { orders };
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


        // Dynamically build the sidebar to ensure it's consistent across all pages.
        const sidebarLinks = [
            { href: '/', text: 'Dashboard' },
            { href: '/analytics', text: 'Analytics' },
            { href: '/vendors', text: 'Vendors' },
            { href: '/croscrow-vendors', text: 'Croscrow Vendors' },
            { href: '/invoices', text: 'Croscrow Invoices' },
            { href: '/croscrow-settings', text: 'Croscrow Settings' },
            { href: '/sync-vendors', text: 'Sync Vendors' },
            { href: '/send-orders', text: 'Send Orders' },
            { href: '/facebook-events', text: 'Facebook Events' },
            { href: '/logout', text: 'Logout' }
        ];

        const pageName = path.basename(templatePath, '.html');
        const sidebarHtml = sidebarLinks.map(link => {
            const linkPage = link.href === '/' ? 'index' : link.href.substring(1);
            const isActive = linkPage === pageName;
            const activeClass = isActive ? ' class="active"' : '';
            return `<li><a href="${link.href}"${activeClass}>${link.text}</a></li>`;
        }).join('\n            ');

        template = template.replace('{{sidebar}}', sidebarHtml);


        // Replace placeholders
        let content = template.replace('{{commissionPercentage}}', commissionPercentage);
        
        if (data.orders && !templatePath.endsWith('invoices.html')) {
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
        }

        if (data.topViewedProducts) {
            const cardsHtml = data.topViewedProducts.map(p => `
                <div class="product-card">
                    <img src="${p.image || ''}" alt="${p.title}">
                    <div class="product-card-content">
                        <div class="product-title" title="${p.title}">${p.title}</div>
                        <div class="event-count">${p.count} Views</div>
                    </div>
                </div>
            `).join('');
            content = content.replace('{{topViewedProductsRow}}', cardsHtml);
        }

        if (data.topAddToCartProducts) {
            const cardsHtml = data.topAddToCartProducts.map(p => `
                <div class="product-card">
                    <img src="${p.image || ''}" alt="${p.title}">
                    <div class="product-card-content">
                        <div class="product-title" title="${p.title}">${p.title}</div>
                        <div class="event-count">${p.count} Adds to Cart</div>
                    </div>
                </div>
            `).join('');
            content = content.replace('{{topAddToCartProductsRow}}', cardsHtml);
        }
        
        if(data.error) {
             content = content.replace('{{errorMessage}}', `<p style="color: red;">Error: ${data.error}</p>`);
        }


        if (template.includes('{{vendorsTable}}')) {
            const vendors = data.vendors || [];
            let vendorsHtml;
            if (vendors.length === 0) {
                vendorsHtml = '<tr><td colspan="3">No vendors found. Add one above to get started.</td></tr>';
            } else {
                vendorsHtml = vendors.map(vendor => {
                    let productsHtml = '';
                    let ordersHtml = '';
                    if (vendor.products && vendor.products.length > 0) {
                        productsHtml = `
                            <tr>
                                <td colspan="3">
                                    <div style="padding: 15px; border-top: 1px solid #e1e4e8;">
                                        <h4>Products from ${vendor.name}</h4>
                                        <table style="width: 100%;">
                                            <thead>
                                                <tr>
                                                    <th><input type="checkbox" class="select-all-vendor-products" data-vendor-id="${vendor._id}"></th>
                                                    <th>Image</th>
                                                    <th>Product</th>
                                                    <th>Category</th>
                                                    <th>Variations (Sizes)</th>
                                                    <th>Price</th>
                                                    <th>Sale Price</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${vendor.products.map(product => {
                                                    const productForDataAttr = { ...product };
                                                    delete productForDataAttr.body_html;
                                                    return `
                                                    <tr class="product-row" data-vendor-id="${vendor._id}" data-product='${JSON.stringify(productForDataAttr).replace(/'/g, "&apos;").replace(/"/g, "&quot;")}'>
                                                        <td><input type="checkbox" class="product-checkbox" data-product-id="${product.id}"></td>
                                                        <td><img src="${product.image ? product.image.src : ''}" alt="${product.title}" width="40"></td>
                                                        <td>${product.title}</td>
                                                        <td>${product.product_type}</td>
                                                        <td>${product.variants.map(v => v.title).join(', ')}</td>
                                                        <td>${product.variants.map(v => v.price).join(', ')}</td>
                                                        <td>${product.variants.map(v => v.compare_at_price || 'N/A').join(', ')}</td>
                                                    </tr>
                                                `}).join('')}
                                            </tbody>
                                        </table>
                                        <div style="margin-top: 15px;">
                                            <button class="button sync-selected-btn" data-vendor-id="${vendor._id}">Sync Selected</button>
                                            <button class="button sync-all-btn" data-vendor-id="${vendor._id}">Sync All</button>
                                        </div>
                                        <div class="sync-status" data-vendor-id="${vendor._id}" style="margin-top: 15px; display: none;">
                                            <div class="loading-indicator"></div>
                                            <pre class="sync-logs"></pre>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }
                    if (vendor.orders && vendor.orders.length > 0) {
                        ordersHtml = `
                            <tr>
                                <td colspan="3">
                                    <div style="padding: 15px; border-top: 1px solid #e1e4e8;">
                                        <h4>Orders from ${vendor.name}</h4>
                                        <table style="width: 100%;">
                                            <thead>
                                                <tr>
                                                    <th>Order Number</th>
                                                    <th>Date</th>
                                                    <th>Customer</th>
                                                    <th>Total</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${vendor.orders.map(order => `
                                                    <tr class="order-summary-row" data-order-id="${order.id}">
                                                        <td>#${order.order_number}</td>
                                                        <td>${new Date(order.created_at).toLocaleDateString()}</td>
                                                        <td>${order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'N/A'}</td>
                                                        <td>$${order.total_price}</td>
                                                        <td><button class="button toggle-details-btn" data-order-id="${order.id}">Details</button></td>
                                                    </tr>
                                                    <tr class="order-details-row" id="details-${order.id}" style="display: none;">
                                                        <td colspan="5">
                                                            <div style="display: flex; padding: 20px; background-color: #f9f9f9;">
                                                                <div style="flex: 1;">
                                                                    <h4>Customer Details</h4>
                                                                    <p><strong>Name:</strong> ${order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'N/A'}</p>
                                                                    <p><strong>Phone:</strong> ${order.customer && order.customer.phone ? order.customer.phone : 'N/A'}</p>
                                                                    <p><strong>Shipping Address:</strong> ${order.shipping_address ? `${order.shipping_address.address1}, ${order.shipping_address.city}, ${order.shipping_address.zip}, ${order.shipping_address.country}` : 'N/A'}</p>
                                                                </div>
                                                                <div style="flex: 2; padding-left: 20px;">
                                                                    <h4>Product Details</h4>
                                                                    ${order.line_items.map(item => `
                                                                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                                                            <img src="${vendor.productImages[item.product_id] || ''}" alt="${item.title}" width="60" style="margin-right: 15px; border-radius: 4px;">
                                                                            <div>
                                                                                <strong>${item.title}</strong><br>
                                                                                Quantity: ${item.quantity}<br>
                                                                                Price: $${item.price}
                                                                            </div>
                                                                        </div>
                                                                    `).join('')}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }

                    return `
                        <tr class="vendor-row">
                            <td>${vendor.name}</td>
                            <td>${vendor.shopifyShopName}</td>
                            <td>
                                <a href="#" class="button sync-btn" data-vendor-id="${vendor._id}">Sync Products</a>
                            </td>
                        </tr>
                        ${productsHtml}
                        ${ordersHtml}
                    `;
                }).join('');
            }
            content = content.replace('{{vendorsTable}}', vendorsHtml);
        }

        if (template.includes('{{croscrowVendorsTable}}')) {
            const vendors = data.vendors || [];
            let vendorsHtml;
            if (vendors.length === 0) {
                vendorsHtml = '<tr><td colspan="4">No vendors found. Add one above to get started.</td></tr>';
            } else {
                vendorsHtml = vendors.map(vendor => {
                    return `
                        <tr>
                            <td>${vendor.name}</td>
                            <td>${vendor.gst_no}</td>
                            <td>${vendor.address}</td>
                            <td><a href="/edit-croscrow-vendor?id=${vendor._id}" class="button">Edit</a></td>
                        </tr>
                    `;
                }).join('');
            }
            content = content.replace('{{croscrowVendorsTable}}', vendorsHtml);
        }



        if (templatePath.endsWith('invoices.html')) {
            const orders = data.orders || [];
            const vendors = data.vendors || [];
            let ordersHtml;
            if (orders.length === 0) {
                ordersHtml = '<tr><td colspan="9">No orders found.</td></tr>';
            } else {
                ordersHtml = orders.map(order => {
                    const vendorOptions = vendors.map(vendor => {
                        const isSelected = order.vendor_id && order.vendor_id === vendor._id.toString();
                        return `<option value="${vendor._id}" ${isSelected ? 'selected' : ''}>${vendor.name}</option>`;
                    }).join('');

                    return `
                        <tr data-order-id="${order.id}">
                            <td>#${order.order_number}</td>
                            <td>${new Date(order.created_at).toLocaleDateString()}</td>
                            <td>${order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'N/A'}</td>
                            <td>$${order.total_price}</td>
                            <td>
                                <select class="vendor-select" data-order-id="${order.id}">
                                    <option value="">Assign Vendor</option>
                                    ${vendorOptions}
                                </select>
                            </td>
                            <td><input type="number" class="manual-shipping" placeholder="e.g., 49" value="${order.manual_shipping || ''}"></td>
                            <td>
                                <select class="discount-type">
                                    <option value="">Select</option>
                                    <option value="croscrow" ${order.discount_type === 'croscrow' ? 'selected' : ''}>Croscrow</option>
                                    <option value="vendor" ${order.discount_type === 'vendor' ? 'selected' : ''}>Vendor</option>
                                </select>
                            </td>
                            <td><input type="number" class="manual-discount" placeholder="e.g., 100" value="${order.manual_discount || ''}"></td>
                            <td><input type="number" class="amount-received" placeholder="e.g., 50" value="${order.amount_received || ''}"></td>
                            <td class="action-cell">
                                <button class="button save-btn" data-order-id="${order.id}">Save</button>
                                <a href="/invoices/generate?order_id=${order.id}" class="button" target="_blank">Invoice</a>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
            content = content.replace('{{ordersTable}}', ordersHtml);
        }


        if (template.includes('{{facebookEventsTable}}')) {
            const events = data.events || [];
            const productImages = data.productImages || {};
            let eventsHtml;
            if (events.length === 0) {
                eventsHtml = '<tr><td colspan="5" class="no-events">No Facebook events found.</td></tr>';
            } else {
                eventsHtml = events.map(event => {
                    const productName = event.productName || event.product_name || 'Unknown Product';
                    const eventType = event.eventType || event.event_type || event.eventName || 'unknown';
                    const timestamp = event.timestamp || event.time || event.created_at || new Date().toISOString();
                    
                    const productId = event.productId || event.product_id || 'N/A';
                    const productImage = productImages[productId] || productImages[parseInt(productId)] || '';
                    
                    let eventTypeClass = 'event-other';
                    let displayEventType = eventType;
                    
                    if (eventType.toLowerCase().includes('view')) {
                        eventTypeClass = 'event-view-content';
                        displayEventType = 'View Content';
                    } else if (eventType.toLowerCase().includes('add') || eventType.toLowerCase().includes('cart')) {
                        eventTypeClass = 'event-add-to-cart';
                        displayEventType = 'Add to Cart';
                    } else if (eventType.toLowerCase().includes('purchase') || eventType.toLowerCase().includes('buy')) {
                        eventTypeClass = 'event-purchase';
                        displayEventType = 'Purchase';
                    }
                    
                    const date = new Date(timestamp);
                    const formattedTime = isNaN(date.getTime()) ? timestamp : date.toLocaleString();
                    
                    const imageHtml = productImage 
                        ? `<img src="${productImage}" alt="${productName}" width="50" style="border-radius: 4px;">`
                        : `<div style="width: 50px; height: 50px; background-color: #f4f6f8; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666;">No Image</div>`;
                    
                    return `<tr>
                        <td>${imageHtml}</td>
                        <td><strong>${productName}</strong></td>
                        <td><span class="event-type ${eventTypeClass}">${displayEventType}</span></td>
                        <td><code style="background-color: #f4f6f8; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${productId}</code></td>
                        <td>${formattedTime}</td>
                    </tr>`;
                }).join('');
            }
            content = content.replace('{{facebookEventsTable}}', eventsHtml);
        }

        if (templatePath.endsWith('send-orders.html')) {
            const orders = data.orders || [];
            const vendors = data.vendors || [];

            const ordersHtml = orders.map(order => `
                <tr>
                    <td><input type="checkbox" class="order-checkbox" data-order-id="${order.id}"></td>
                    <td>#${order.order_number}</td>
                    <td>${new Date(order.created_at).toLocaleDateString()}</td>
                    <td>${order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'N/A'}</td>
                    <td>$${order.total_price}</td>
                    <td>${order.financial_status}</td>
                </tr>
            `).join('');
            content = content.replace('{{ordersToSendTable}}', ordersHtml);
            
            const vendorsHtml = vendors.map(vendor => `
                <option value="${vendor._id}">${vendor.name} (${vendor.shopifyShopName})</option>
            `).join('');
            content = content.replace('{{vendorsSelectOptions}}', vendorsHtml);
        }

        // Generic replacement for simple key-value pairs (for sticky filters)
        for (const key in data) {
            if (Object.hasOwnProperty.call(data, key)) {
                if (typeof data[key] === 'string' || typeof data[key] === 'number') {
                    content = content.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
                }
            }
        }
        
        // simple if/else helper
        const ifRegex = /{{#if\s+(.*?)}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g;
        content = content.replace(ifRegex, (match, condition, ifTemplate, elseTemplate) => {
            const keys = condition.split('.');
            let value = data;
            for (const k of keys) {
                if (value && typeof value === 'object' && k in value) {
                    value = value[k];
                } else {
                    value = undefined;
                    break;
                }
            }

            if (value) {
                return ifTemplate;
            } else if (elseTemplate) {
                return elseTemplate;
            } else {
                return '';
            }
        });
        
        // context-aware each helper
        const eachRegex = /{{#each\s+(.*?)}}([\s\S]*?){{\/each}}/g;
        content = content.replace(eachRegex, (match, arrayName, template) => {
            const items = data[arrayName];
            if (!items) return '';

            return items.map(item => {
                let itemTemplate = template;

                // Create a combined context for replacements
                const combinedContext = { ...item, '..': data };

                // Replace simple placeholders like {{key}}
                itemTemplate = itemTemplate.replace(/{{\s*([\w\.]+)\s*}}/g, (mustacheMatch, key) => {
                    // Handle ../ notation
                    if (key.startsWith('../')) {
                        const parentKey = key.substring(3);
                        return data[parentKey] || '';
                    }
                    return item[key] || '';
                });

                // Handle simple helpers like {{#if (eq ../manual_vendor_id (string _id))}}
                itemTemplate = itemTemplate.replace(/{{#if\s+\((.*?)\)\s*}}([\s\S]*?){{\/if}}/g, (ifMatch, condition, ifContent) => {
                    const parts = condition.split(' ');
                    if (parts.length === 3 && parts[0] === 'eq') {
                        const val1 = parts[1].startsWith('../') ? data[parts[1].substring(3)] : item[parts[1]];
                        const val2Raw = parts[2];
                        let val2;
                        if (val2Raw.startsWith('(string ')) {
                             const innerKey = val2Raw.match(/\(string (.*?)\)/)[1];
                             val2 = String(item[innerKey]);
                        } else {
                             val2 = item[val2Raw];
                        }
                        if (val1 == val2) {
                            return ifContent;
                        }
                    }
                    return '';
                });

                 // Replace nested {{#each}} loops
                 itemTemplate = itemTemplate.replace(/{{#each\s+([\w\.]+)\s*}}([\s\S]*?){{\/each}}/g, (nestedMatch, nestedArrayName, nestedTemplate) => {
                    if (nestedArrayName.startsWith('../')) {
                        const parentArrayName = nestedArrayName.substring(3);
                        const parentArray = data[parentArrayName];
                        if (parentArray) {
                            return parentArray.map(parentItem => {
                                let nestedItemTemplate = nestedTemplate;
                                // Perform replacements for the nested loop
                                nestedItemTemplate = nestedItemTemplate.replace(/{{#if\s+\(eq\s+\.\.\/manual_vendor_id\s+\(string _id\)\)\s*}}([\s\S]*?){{\/if}}/g, (nestedIfMatch, nestedIfContent) => {
                                    if (String(item.manual_vendor_id) === String(parentItem._id)) {
                                        return nestedIfContent.replace(/{{\s*name\s*}}/g, parentItem.name);
                                    }
                                    return '';
                                });
                                return nestedItemTemplate;

                            }).join('');
                        }
                    }
                    return'';
                });


                return itemTemplate;
            }).join('');
        });

        // simple replacement for nested objects
        const regex = /{{\s*([\w.]+)\s*}}/g;
        content = content.replace(regex, (match, key) => {
            const keys = key.split('.');
            let value = data;
            for (const k of keys) {
                if (value && typeof value === 'object' && k in value) {
                    value = value[k];
                } else {
                    return '';
                }
            }
            return value;
        });

        const helpers = {
            formatDate: (dateString) => {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-CA');
            },
            eq: (a, b) => a == b,
            string: (val) => String(val)
        };


        const eachRegexWithContext = /{{#each\s+([\w\.]+)\s*}}([\s\S]*?){{\/each}}/g;
        content = content.replace(eachRegexWithContext, (match, arrayName, template) => {
            const items = arrayName.split('.').reduce((o, i) => o[i], { ...data, ...helpers });

            if (!items) return '';

            return items.map(item => {
                let itemTemplate = template;
                const allData = { ...item, '../vendors': data.vendors, ...helpers };

                // Handle nested paths and helpers inside the loop
                itemTemplate = itemTemplate.replace(/{{#if\s+\((.*?)\)\s*}}([\s\S]*?){{\/if}}/g, (ifMatch, ifCondition, ifTemplate) => {
                    const [helper, ...args] = ifCondition.split(' ');
                    const realArgs = args.map(arg => {
                        return (allData[arg] !== undefined) ? allData[arg] : arg.replace(/"/g, '');
                    });
                    if (allData[helper] && allData[helper](...realArgs)) {
                        return ifTemplate;
                    }
                    return '';
                });

                itemTemplate = itemTemplate.replace(/{{([\w\.\/]+)}}/g, (mustacheMatch, key) => {
                    const value = key.split('.').reduce((o, i) => o && o[i], allData);
                    return value !== undefined ? value : '';
                });

                 return itemTemplate;
            }).join('');
        });


        content = content.replace('{{sidebar}}', sidebarHtml);
        
        // Final cleanup of any un-replaced placeholders
        content = content.replace(/{{[^{}]+}}/g, '');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
    });
}

// --- Cookie Parser ---
function parseCookies(request) {
    const list = {};
    const cookieHeader = request.headers?.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(function(cookie) {
        let [ name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        if (!value) return;
        list[name] = decodeURIComponent(value);
    });

    return list;
}

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
    const cookies = parseCookies(req);
    const isAuthenticated = cookies.loggedIn === 'true';

    const loginTemplatePath = path.join(__dirname, 'views', 'login.html');

    // --- Handle Login ---
    const publicRoutes = ['/login', '/track-fb-event'];
    if (
        !isAuthenticated &&
        req.method !== 'OPTIONS' &&
        !publicRoutes.some(p => req.url.startsWith(p)) &&
        !req.url.startsWith('/public/')
    ) {
        res.writeHead(302, { 'Location': '/login' });
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/login') {
        fs.readFile(loginTemplatePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading login page');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content.replace('{{errorMessage}}', ''));
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/login') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const postData = querystring.parse(body);
            if (postData.password === 'qqqq') {
                res.writeHead(302, {
                    'Set-Cookie': 'loggedIn=true; HttpOnly; Path=/',
                    'Location': '/'
                });
                res.end();
            } else {
                fs.readFile(loginTemplatePath, 'utf8', (err, content) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Error loading login page');
                        return;
                    }
                    res.writeHead(401, { 'Content-Type': 'text/html' });
                    res.end(content.replace('{{errorMessage}}', '<p class="error">Invalid password</p>'));
                });
            }
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/logout') {
        res.writeHead(302, {
            'Set-Cookie': 'loggedIn=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
            'Location': '/login'
        });
        res.end();
        return;
    }

    const templatePath = path.join(__dirname, 'views', 'index.html');

    // --- Handle OPTIONS request for CORS preflight ---
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*', // Allow any origin
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

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
    // --- Handle POST request to track facebook event ---
    else if (req.method === 'POST' && req.url.startsWith('/track-fb-event')) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const eventData = JSON.parse(body);
                await trackFacebookEvent(eventData);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('Error tracking facebook event:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
            }
        });
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
                fetchAllProducts(),
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
    // --- Handle GET and POST for Vendors page ---
    else if (req.url === '/vendors' && req.method === 'GET') {
        const vendorsTemplatePath = path.join(__dirname, 'views', 'vendors.html');
        try {
            const vendors = await getVendors();
            for (const vendor of vendors) {
                try {
                    const [vendorProducts, vendorOrders] = await Promise.all([
                        fetchFromShopify('/admin/api/2024-04/products.json', {
                            shopName: vendor.shopifyShopName,
                            accessToken: vendor.shopifyAccessToken
                        }),
                        fetchFromShopify('/admin/api/2024-04/orders.json', {
                            shopName: vendor.shopifyShopName,
                            accessToken: vendor.shopifyAccessToken
                        })
                    ]);
                    vendor.products = vendorProducts.products;
                    vendor.orders = vendorOrders.orders;

                    const productImages = {};
                    if (vendor.products) {
                        vendor.products.forEach(p => {
                            if (p.image) {
                                productImages[p.id] = p.image.src;
                            }
                        });
                    }
                    vendor.productImages = productImages;

                } catch (e) {
                    console.error(`Failed to fetch data for vendor ${vendor.name}:`, e.message);
                    vendor.products = []; // Ensure products is an empty array on error
                    vendor.orders = []; // Ensure orders is an empty array on error
                }
            }
            renderView(res, vendorsTemplatePath, { vendors }, 0);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            renderView(res, vendorsTemplatePath, { error: 'Could not fetch vendors.' }, 0);
        }
    }
    else if (req.url === '/vendors' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = querystring.parse(body);
                await createVendor({
                    name: postData.name,
                    shopifyShopName: postData.shopifyShopName,
                    shopifyAccessToken: postData.shopifyAccessToken
                });
                res.writeHead(302, { 'Location': '/vendors' });
                res.end();
            } catch (error) {
                console.error('Error creating vendor:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Failed to create vendor.');
            }
        });
    }
    // --- Handle GET and POST for Croscrow Vendors page ---
    else if (req.url === '/croscrow-vendors' && req.method === 'GET') {
        const vendorsTemplatePath = path.join(__dirname, 'views', 'croscrow-vendors.html');
        try {
            const vendors = await getCroscrowVendors();
            renderView(res, vendorsTemplatePath, { vendors }, 0);
        } catch (error) {
            console.error('Error fetching croscrow vendors:', error);
            renderView(res, vendorsTemplatePath, { error: 'Could not fetch croscrow vendors.' }, 0);
        }
    } else if (req.url === '/croscrow-vendors' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = querystring.parse(body);
                await createCroscrowVendor({
                    name: postData.name,
                    gst_no: postData.gst_no,
                    address: postData.address
                });
                res.writeHead(302, {
                    'Location': '/croscrow-vendors'
                });
                res.end();
            } catch (error) {
                console.error('Error creating croscrow vendor:', error);
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                });
                res.end('Failed to create croscrow vendor.');
            }
        });
    }
    // --- Handle GET and POST for Croscrow Settings page ---
    else if (req.url === '/croscrow-settings' && req.method === 'GET') {
        const settingsTemplatePath = path.join(__dirname, 'views', 'croscrow-settings.html');
        try {
            const settings = await getCroscrowSettings();
            renderView(res, settingsTemplatePath, { settings }, 0);
        } catch (error) {
            console.error('Error fetching croscrow settings:', error);
            renderView(res, settingsTemplatePath, { error: 'Could not fetch croscrow settings.' }, 0);
        }
    } else if (req.url === '/croscrow-settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = querystring.parse(body);
                await setCroscrowSettings({
                    logo_url: postData.logo_url,
                    gst_details: postData.gst_details,
                    address: postData.address
                });
                res.writeHead(302, { 'Location': '/croscrow-settings' });
                res.end();
            } catch (error) {
                console.error('Error saving croscrow settings:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Failed to save croscrow settings.');
            }
        });
    }
    // --- Handle GET and POST for Invoices page ---
    else if (req.url === '/invoices' && req.method === 'GET') {
        const invoicesTemplatePath = path.join(__dirname, 'views', 'invoices.html');
        try {
            const [orderData, vendors, commissionOrders, manualOrders] = await Promise.all([
                fetchAllOrders(),
                getCroscrowVendors(),
                getCommissionOrders(),
                getManualOrders()
            ]);

            const commissionOrdersMap = commissionOrders.reduce((map, order) => {
                map[order.order_id] = order;
                return map;
            }, {});

            const mergedOrders = orderData.orders.map(order => {
                const commissionOrder = commissionOrdersMap[String(order.id)];
                return {
                    ...order,
                    ...commissionOrder
                };
            });

            renderView(res, invoicesTemplatePath, {
                orders: mergedOrders,
                vendors,
                manualOrders
            }, 0);
        } catch (error) {
            console.error('Error fetching invoices data:', error);
            renderView(res, invoicesTemplatePath, {
                error: 'Could not fetch invoices data.'
            }, 0);
        }
    } else if (req.url === '/invoices/assign-vendor' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = JSON.parse(body);
                await saveCommissionOrder({
                    order_id: postData.order_id,
                    vendor_id: postData.vendor_id,
                    manual_shipping: postData.manual_shipping,
                    discount_type: postData.discount_type,
                    manual_discount: postData.manual_discount,
                    amount_received: postData.amount_received
                });
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    success: true
                }));
            } catch (error) {
                console.error('Error assigning vendor:', error);
                res.writeHead(500, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Failed to assign vendor.'
                }));
            }
        });
    } else if (req.url === '/invoices/generate-manual' && req.method === 'POST') {
        const invoiceTemplatePath = path.join(__dirname, 'views', 'invoice-template.html');
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = querystring.parse(body);
                const manualOrderId = postData.manual_order_id;
                const manualAmount = parseFloat(postData.manual_amount);
                const vendorId = postData.manual_vendor_id;

                if (!manualOrderId || isNaN(manualAmount) || !vendorId) {
                    throw new Error('Manual Order ID, a valid Amount, and a Vendor are required.');
                }

                const vendor = await getCroscrowVendorById(vendorId);
                if (!vendor) {
                    throw new Error('Selected vendor not found.');
                }

                // Create a commissionOrder object from the form data
                const commissionOrder = {
                    manual_shipping: postData.manual_shipping || 0,
                    discount_type: postData.discount_type || '',
                    manual_discount: postData.manual_discount || 0,
                    amount_received: postData.amount_received || 0,
                };

                // Create a mock order object that mimics the Shopify order structure
                const mockOrder = {
                    order_number: manualOrderId,
                    created_at: new Date().toISOString(),
                    total_line_items_price: manualAmount,
                    customer: { first_name: 'Manual', last_name: 'Entry' },
                    shipping_address: { address1: '', city: '', zip: '', country: '' },
                    line_items: [{ title: 'Manual Item', quantity: 1, price: manualAmount }]
                };
                
                const croscrowSettings = await getCroscrowSettings();

                // --- Calculation Logic (copied from /invoices/generate) ---
                const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

                const discount = parseFloat(commissionOrder.manual_discount || 0);
                let commissionable_amount = manualAmount;

                if (commissionOrder.discount_type === 'vendor') {
                    commissionable_amount -= discount;
                }

                const base_commission = commissionable_amount * 0.20;

                const shipping = parseFloat(commissionOrder.manual_shipping || 0);
                
                let subtotal = base_commission + shipping;
                if (commissionOrder.discount_type === 'croscrow') {
                    subtotal -= discount;
                }

                const gst = subtotal * 0.18;
                let total_commission = subtotal + gst;

                const amount_received = parseFloat(commissionOrder.amount_received || 0);
                total_commission -= amount_received;

                const invoiceData = {
                    order: mockOrder,
                    vendor: vendor,
                    commissionOrder: commissionOrder,
                    croscrowSettings,
                    invoice_date: new Date().toLocaleDateString('en-CA'),
                    order_date: new Date().toLocaleDateString('en-CA'),

                    commissionable_amount_formatted: currencyFormatter.format(commissionable_amount),
                    base_commission_formatted: currencyFormatter.format(base_commission),
                    shipping_formatted: currencyFormatter.format(shipping),
                    discount_formatted: currencyFormatter.format(discount),
                    subtotal_formatted: currencyFormatter.format(subtotal),
                    gst_formatted: currencyFormatter.format(gst),
                    amount_received_formatted: currencyFormatter.format(amount_received),
                    total_commission_formatted: currencyFormatter.format(total_commission),
                };

                renderView(res, invoiceTemplatePath, invoiceData, 0);

            } catch (error) {
                console.error('Error generating manual invoice:', error);
                renderView(res, path.join(__dirname, 'views', 'invoice-template.html'), {
                    error: `Could not generate manual invoice: ${error.message}`
                }, 0);
            }
        });
    } else if (req.url === '/invoices/save-manual' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = querystring.parse(body);
                const manualOrder = {
                    manual_order_id: postData.manual_order_id,
                    manual_amount: postData.manual_amount,
                    manual_vendor_id: postData.manual_vendor_id,
                    manual_shipping: postData.manual_shipping,
                    discount_type: postData.discount_type,
                    manual_discount: postData.manual_discount,
                    amount_received: postData.amount_received,
                    createdAt: new Date()
                };
                await saveManualOrder(manualOrder);
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    success: true
                }));
            } catch (error) {
                console.error('Error saving manual order:', error);
                res.writeHead(500, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Failed to save manual order.'
                }));
            }
        });
    } else if (req.url.startsWith('/invoices/generate') && req.method === 'GET') {
        const invoiceTemplatePath = path.join(__dirname, 'views', 'invoice-template.html');
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const orderId = url.searchParams.get('order_id');
            const [orderData, commissionOrders, croscrowSettings] = await Promise.all([
                fetchFromShopify(`/admin/api/2024-04/orders/${orderId}.json`),
                getCommissionOrders(),
                getCroscrowSettings()
            ]);

            const order = orderData.order;
            if (!order) {
                throw new Error('Order not found.');
            }

            const commissionOrder = commissionOrders.find(co => co.order_id == order.id);
            if (!commissionOrder) {
                throw new Error('Commission data not found for this order. Please save vendor and other details first.');
            }

            const vendor = await getCroscrowVendorById(commissionOrder.vendor_id);
            if (!vendor) {
                throw new Error('Vendor not found for this order.');
            }

            // --- Calculation Logic ---
            const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

            const discount = parseFloat(commissionOrder.manual_discount || 0);
            let commissionable_amount = parseFloat(order.total_line_items_price);

            if (commissionOrder.discount_type === 'vendor') {
                commissionable_amount -= discount;
            }

            const base_commission = commissionable_amount * 0.20;

            const shipping = parseFloat(commissionOrder.manual_shipping || 0);
            
            let subtotal = base_commission + shipping;
            if (commissionOrder.discount_type === 'croscrow') {
                subtotal -= discount;
            }

            const gst = subtotal * 0.18;
            let total_commission = subtotal + gst;

            const amount_received = parseFloat(commissionOrder.amount_received || 0);
            total_commission -= amount_received;

            const invoiceData = {
                order,
                vendor,
                commissionOrder,
                croscrowSettings,
                invoice_date: new Date().toLocaleDateString('en-CA'),
                order_date: new Date(order.created_at).toLocaleDateString('en-CA'),

                commissionable_amount_formatted: currencyFormatter.format(commissionable_amount),
                base_commission_formatted: currencyFormatter.format(base_commission),
                shipping_formatted: currencyFormatter.format(shipping),
                discount_formatted: currencyFormatter.format(discount),
                subtotal_formatted: currencyFormatter.format(subtotal),
                gst_formatted: currencyFormatter.format(gst),
                amount_received_formatted: currencyFormatter.format(amount_received),
                total_commission_formatted: currencyFormatter.format(total_commission),
            };

            renderView(res, invoiceTemplatePath, invoiceData, 0);

        } catch (error) {
            console.error('Error generating invoice:', error);
            renderView(res, path.join(__dirname, 'views', 'invoice-template.html'), {
                error: `Could not generate invoice: ${error.message}`
            }, 0);
        }
    }
    // --- Handle GET and POST for Sync Vendors page ---
    else if (req.url === '/sync-vendors' && req.method === 'GET') {
        const syncVendorsTemplatePath = path.join(__dirname, 'views', 'sync-vendors.html');
        renderView(res, syncVendorsTemplatePath, {}, 0);
    } else if (req.url === '/sync-vendors' && req.method === 'POST') {
        const syncVendorsTemplatePath = path.join(__dirname, 'views', 'sync-vendors.html');
        try {
            const {
                products
            } = await fetchAllProducts();
            const existingVendors = await getCroscrowVendors();
            const existingVendorNames = new Set(existingVendors.map(v => v.name));

            const shopifyVendors = new Set(products.map(p => p.vendor));
            let newVendorsCount = 0;

            for (const vendorName of shopifyVendors) {
                if (!existingVendorNames.has(vendorName)) {
                    await createCroscrowVendor({
                        name: vendorName,
                        gst_no: '',
                        address: ''
                    });
                    newVendorsCount++;
                }
            }

            renderView(res, syncVendorsTemplatePath, {
                message: `Sync complete. Added ${newVendorsCount} new vendors.`
            }, 0);

        } catch (error) {
            console.error('Error syncing vendors:', error);
            renderView(res, syncVendorsTemplatePath, {
                message: `Error syncing vendors: ${error.message}`
            }, 0);
        }
    }
    // --- Handle GET and POST for Edit Croscrow Vendor page ---
    else if (req.url.startsWith('/edit-croscrow-vendor') && req.method === 'GET') {
        const editVendorTemplatePath = path.join(__dirname, 'views', 'edit-croscrow-vendor.html');
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const vendorId = url.searchParams.get('id');
            const vendor = await getCroscrowVendorById(vendorId);
            if (!vendor) {
                throw new Error('Vendor not found');
            }
            renderView(res, editVendorTemplatePath, {
                vendor
            }, 0);
        } catch (error) {
            console.error('Error fetching vendor for editing:', error);
            renderView(res, path.join(__dirname, 'views', 'croscrow-vendors.html'), {
                error: `Could not fetch vendor for editing: ${error.message}`
            }, 0);
        }
    } else if (req.url === '/edit-croscrow-vendor' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const postData = querystring.parse(body);
                const vendorId = postData.id;
                const vendorData = {
                    gst_no: postData.gst_no,
                    address: postData.address
                };
                await updateCroscrowVendor(vendorId, vendorData);
                res.writeHead(302, {
                    'Location': '/croscrow-vendors'
                });
                res.end();
            } catch (error) {
                console.error('Error updating croscrow vendor:', error);
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                });
                res.end('Failed to update croscrow vendor.');
            }
        });
    }
    // --- Handle GET request for the Send Orders page ---
    else if (req.url === '/send-orders' && req.method === 'GET') {
        const sendOrdersTemplatePath = path.join(__dirname, 'views', 'send-orders.html');
        try {
            const [orderData, vendors] = await Promise.all([
                fetchFromShopify('/admin/api/2024-04/orders.json?status=any'),
                getVendors()
            ]);
            renderView(res, sendOrdersTemplatePath, { orders: orderData.orders, vendors }, 0);
        } catch (error) {
            console.error('Error fetching data for Send Orders page:', error);
            renderView(res, sendOrdersTemplatePath, { error: error.message }, 0);
        }
    }
    // --- Handle POST request to send orders to a vendor ---
    else if (req.url === '/send-orders' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            console.log('--- Received request to /send-orders ---');
            try {
                const { orderIds, vendorId } = JSON.parse(body);
                console.log('Request Body:', { orderIds, vendorId });


                if (!orderIds || !vendorId || orderIds.length === 0) {
                    throw new Error('Missing order IDs or vendor ID.');
                }

                const vendor = await getVendorById(vendorId);
                if (!vendor) {
                    throw new Error('Vendor not found.');
                }
                console.log('Found Vendor:', vendor.name);


                let successCount = 0;
                let errorCount = 0;

                for (const orderId of orderIds) {
                    console.log(`--- Processing Order ID: ${orderId} ---`);
                    try {
                        const { order } = await fetchFromShopify(`/admin/api/2024-04/orders/${orderId}.json`);
                        console.log(`Fetched full order #${order.order_number} from main store.`);

                        if (!order.customer || !order.shipping_address) {
                            throw new Error(`Order #${order.order_number} is missing customer or shipping address details.`);
                        }

                        const draftOrderPayload = {
                            draft_order: {
                                line_items: order.line_items.map(item => ({
                                    title: item.title,
                                    price: item.price,
                                    quantity: item.quantity,
                                    requires_shipping: item.requires_shipping,
                                    grams: item.grams || 0,
                                })),
                                customer: {
                                    first_name: order.customer.first_name,
                                    last_name: order.customer.last_name,
                                    email: order.customer.email,
                                },
                                shipping_address: order.shipping_address,
                                use_customer_default_address: false,
                            }
                        };
                        
                        console.log('Constructed Draft Order Payload for Vendor:');
                        console.log(JSON.stringify(draftOrderPayload, null, 2));

                        console.log(`Sending Draft Order to Vendor: ${vendor.name}...`);
                        const vendorResponse = await postToVendorShopify(vendor, '/admin/api/2024-04/draft_orders.json', draftOrderPayload);
                        console.log(`Successfully sent Draft Order for order #${order.order_number}. Vendor response:`, vendorResponse);
                        successCount++;
                    } catch (e) {
                        console.error(`Failed to send order ${orderId} to vendor ${vendor.name}:`, e.message);
                        errorCount++;
                    }
                }

                console.log('--- Finished /send-orders request ---');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    message: `Successfully sent ${successCount} orders. Failed to send ${errorCount} orders.`,
                    success: errorCount === 0 
                }));

            } catch (error) {
                console.error('Error processing send-orders request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: `Failed to send orders: ${error.message}` }));
            }
        });
    }
    // --- Handle GET request for vendor products ---
    else if (req.url.startsWith('/vendors/') && req.url.endsWith('/products') && req.method === 'GET') {
        try {
            const vendorId = req.url.split('/')[2];
            const vendor = await getVendorById(vendorId);
            if (!vendor) {
                throw new Error('Vendor not found');
            }

            const vendorProducts = await fetchFromShopify('/admin/api/2024-04/products.json', {
                shopName: vendor.shopifyShopName,
                accessToken: vendor.shopifyAccessToken
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(vendorProducts));

        } catch (error) {
            console.error('Error fetching vendor products:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: `Failed to fetch vendor products: ${error.message}` }));
        }
    }
    // --- Handle Product Sync for a Vendor ---
    else if (req.url === '/vendors/sync-products' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            res.writeHead(200, { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' });
            
            try {
                const { products: productsToSync, vendorId } = JSON.parse(body);
                const vendor = await getVendorById(vendorId);

                if (!vendor) {
                    throw new Error('Vendor not found for syncing.');
                }
                
                res.write(`Starting sync for ${vendor.name}...\n`);

                // 1. Fetch all products from the main store to check for existing ones
                res.write('Fetching existing products from your store...\n');
                const mainStoreProducts = await fetchAllProducts();
                const mainStoreProductMap = mainStoreProducts.products.reduce((map, product) => {
                    map[product.title] = product.id; // Use title as the key
                    return map;
                }, {});
                res.write(`Found ${mainStoreProducts.products.length} existing products.\n\n`);

                // 2. Loop and create or update each product on the main store
                for (const product of productsToSync) {
                    res.write(`Syncing: ${product.title}...\n`);
                    // Ensure handle is set for checking existing products
                    if (!product.handle) {
                        product.handle = product.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    }
                    let newProductPayload;
                    let updatePayload;

                    try {
                        const existingProductId = mainStoreProductMap[product.title];

                        if (existingProductId) {
                            res.write(`  -> Found existing product. Updating...\n`);
                            // Product exists, so update it.
                            const existingProduct = await fetchFromShopify(`/admin/api/2024-04/products/${existingProductId}.json`);
                            const existingVariants = existingProduct.product.variants;
                            const existingVariantMap = existingVariants.reduce((map, variant) => {
                                if (variant.sku) map[variant.sku] = variant.id;
                                return map;
                            }, {});

                            updatePayload = {
                                product: {
                                    id: existingProductId,
                                    title: product.title,
                                    body_html: "",
                                    vendor: vendor.name,
                                    product_type: product.product_type,
                                    tags: product.tags,
                                    status: product.status || 'active',
                                    options: product.options.map(opt => ({
                                        name: opt.name,
                                        values: opt.values
                                    })),
                                    variants: product.variants.map(v => {
                                        const existingVariantId = v.sku ? existingVariantMap[v.sku] : null;
                                        if (existingVariantId) {
                                            const variantPayload = {
                                                id: existingVariantId,
                                                price: String(v.price || "0"),
                                                inventory_quantity: Math.max(0, Number(v.inventory_quantity || 0)),
                                                inventory_management: "shopify",
                                                option1: v.option1,
                                                option2: v.option2,
                                                option3: v.option3,
                                                sku: v.sku
                                            };
                                            if (v.compare_at_price) variantPayload.compare_at_price = String(v.compare_at_price);
                                            return variantPayload;
                                        }
                                        const newVariantPayload = {
                                            price: String(v.price || "0"),
                                            inventory_quantity: Math.max(0, Number(v.inventory_quantity || 0)),
                                            inventory_management: "shopify",
                                            option1: v.option1,
                                            option2: v.option2,
                                            option3: v.option3,
                                            sku: v.sku
                                        };
                                        if (v.compare_at_price) newVariantPayload.compare_at_price = String(v.compare_at_price);
                                        return newVariantPayload;
                                    }).map(v => {
                                        // Remove product_id from variants as it's not needed in update payload
                                        const { product_id, ...rest } = v;
                                        return rest;
                                    }),
                                }
                            };
                            await putToShopify(`/admin/api/2024-04/products/${existingProductId}.json`, updatePayload);
                            res.write(`  -> Successfully updated.\n\n`);
                        } else {
                            res.write(`  -> Product not found. Creating new product...\n`);
                            // Product doesn't exist, so create it.
                            
                            newProductPayload = {
                                product: {
                                    title: product.title,
                                    body_html: "",
                                    vendor: vendor.name,
                                    status: product.status || 'active',
                                    images: product.images || []
                                }
                            };

                            if (product.product_type) {
                                newProductPayload.product.product_type = product.product_type;
                            }
                            if (product.tags && product.tags.length > 0) {
                                newProductPayload.product.tags = Array.isArray(product.tags) ? product.tags.join(",") : product.tags;
                            }

                            if (product.variants && product.variants.length > 0) {
                                newProductPayload.product.options = (product.options || []).map((opt, index) => ({
                                    name: opt.name,
                                    values: opt.values,
                                    position: opt.position || index + 1
                                }));

                                newProductPayload.product.variants = product.variants.map(v => {
                                    const variantPayload = {
                                        title: v.title,
                                        price: String(v.price || "0"),
                                        inventory_quantity: Math.max(0, Number(v.inventory_quantity || 0)),
                                        inventory_management: "shopify"
                                    };
                                    if (v.compare_at_price) variantPayload.compare_at_price = String(v.compare_at_price);
                                    if (v.option1) variantPayload.option1 = v.option1;
                                    if (v.option2) variantPayload.option2 = v.option2;
                                    if (v.option3) variantPayload.option3 = v.option3;
                                    if (v.sku) variantPayload.sku = v.sku;
                                    return variantPayload;
                                });
                            } else {
                                newProductPayload.product.options = [];
                                newProductPayload.product.variants = [{
                                    price: product.variants?.[0]?.price || '0',
                                    inventory_management: 'shopify',
                                    inventory_quantity: 0
                                }];
                            }
                            
                            // Create the product
                            await postToShopify('/admin/api/2024-04/products.json', newProductPayload);
                            res.write(`  -> Successfully created.\n\n`);
                        }
                    } catch (e) {
                        res.write(`  -> FAILED to sync: ${e.message}\n\n`);
                        // Log full details to server console for debugging
                        console.error(`--> Failed to sync product: "${product.title}" (ID: ${product.id}). Reason: ${e.message}`);
                        if (newProductPayload) { 
                            console.log('--- Failing Payload for Creation ---');
                            console.log(JSON.stringify(newProductPayload, null, 2));
                        }
                        if (updatePayload) {
                            console.log('--- Failing Payload for Update ---');
                            console.log(JSON.stringify(updatePayload, null, 2));
                        }
                    }
                }
                res.end(); // End the stream

            } catch (error) {
                console.error('Error during selective sync:', error);
                res.write(`\n\nFATAL ERROR: ${error.message}`);
                res.end(); // End the stream on fatal error
            }
        });
    }



    // --- Handle GET request for the Facebook Events page ---
    else if (req.url.startsWith('/facebook-events') && req.method === 'GET') {
        const facebookEventsTemplatePath = path.join(__dirname, 'views', 'facebook-events.html');
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const filters = {
                period: url.searchParams.get('period') || 'all',
                startDate: url.searchParams.get('startDate') || '',
                endDate: url.searchParams.get('endDate') || '',
                eventType: url.searchParams.get('eventType') || 'all'
            };

            // Fetch all data in parallel
            const [
                eventCounts,
                topViewedData,
                topAddToCartData,
                productDataResponse,
                events
            ] = await Promise.all([
                getFacebookEventCounts(filters),
                getTopFacebookEventsByProduct('ViewContent', filters),
                getTopFacebookEventsByProduct('AddToCart', filters),
                fetchAllProducts(),
                getFacebookEvents(filters)
            ]);

            // Create a product lookup map for efficient access
            const productMap = new Map();
            if (productDataResponse && productDataResponse.products) {
                productDataResponse.products.forEach(p => {
                    productMap.set(String(p.id), {
                        title: p.title,
                        image: p.image ? p.image.src : ''
                    });
                });
            }

            // Combine top event data with product details
            const topViewedProducts = topViewedData
                .map(item => ({ ...item, ...productMap.get(String(item.productId)) }))
                .filter(item => item.title); // Ensure product exists

            const topAddToCartProducts = topAddToCartData
                .map(item => ({ ...item, ...productMap.get(String(item.productId)) }))
                .filter(item => item.title); // Ensure product exists

            // Create a map of all product images for the main event table
            const productImages = {};
            for (const [key, value] of productMap.entries()) {
                productImages[key] = value.image;
            }
            
            const renderData = {
                events,
                productImages,
                topViewedProducts,
                topAddToCartProducts,
                viewContentCount: eventCounts.ViewContent || 0,
                addToCartCount: eventCounts.AddToCart || 0,
                initiateCheckoutCount: eventCounts.InitiateCheckout || 0,
                purchaseCount: eventCounts.Purchase || 0,
                startDate: filters.startDate,
                endDate: filters.endDate,
                [`selectedPeriod_${filters.period}`]: 'selected',
                [`selectedEventType_${filters.eventType}`]: 'selected'
            };

            renderView(res, facebookEventsTemplatePath, renderData, 0);
        } catch (error) {
            console.error('Error in Facebook events page:', error);
            renderView(res, facebookEventsTemplatePath, { 
                error: 'Unable to load Facebook events data' 
            }, 0);
        }
    }
    // --- Handle static files (like CSS, client-side JS) ---
    else if (req.method === 'GET' && req.url.startsWith('/public/')) {
        const filePath = path.join(__dirname, req.url);
        console.log(`Serving static file: ${filePath}`);
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else {
                let contentType = 'text/plain';
                if (filePath.endsWith('.js')) {
                    contentType = 'application/javascript';
                } else if (filePath.endsWith('.css')) {
                    contentType = 'text/css';
                }
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
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