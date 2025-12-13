# How to Build a Multi-Vendor Event Tracker

This guide provides a step-by-step process for creating a generalized, multi-vendor event tracking application from scratch. The system will consist of a central server to collect data, a dashboard for vendors to view their analytics, and a client-side script for vendors to install on their websites.

---

### **Core Architecture**

The application has three main parts:
1.  **The Backend Server:** A Node.js application that listens for incoming events, validates them, and stores them in a database. It also serves event data to the vendor dashboard.
2.  **The Vendor Dashboard:** A simple web application where a vendor can "log in" using a unique identifier (like their store URL) to see their own event analytics, with filters for time and event type.
3.  **The Tracking Script:** A JavaScript snippet that vendors add to their website. It tracks user actions (like product views and adds to cart) and sends this data to the backend server.

---

### **Part 1: The Backend Server (Node.js & Express)**

The server is the heart of the application, responsible for ingesting and serving all event data.

#### **Step 1: Project Setup**

1.  Create a new project directory and initialize a Node.js project.
    ```bash
    mkdir vendor-event-tracker-backend
    cd vendor-event-tracker-backend
    npm init -y
    ```
2.  Install the necessary packages:
    *   `express`: A web framework for creating the server and API endpoints.
    *   `mongodb`: The official driver to connect to a MongoDB database.
    *   `cors`: A middleware to enable Cross-Origin Resource Sharing, which is essential for receiving requests from different vendor websites.
    ```bash
    npm install express mongodb cors
    ```

#### **Step 2: Database Schema (MongoDB)**

You'll need a database to store the events. A MongoDB collection is a good choice.

*   **Collection Name:** `events`
*   **Document Schema:** Each document in the collection will represent a single event. It's crucial to include a `vendorId` to distinguish which vendor the event belongs to.

    ```json
    {
      "vendorId": "my-cool-store.com", // Unique identifier for the vendor
      "eventName": "ViewContent",         // The type of event (e.g., ViewContent, AddToCart)
      "productId": "prod_12345",
      "productName": "Stylish T-Shirt",
      "productImage": "https://example.com/image.jpg",
      "timestamp": "2025-12-12T10:00:00.000Z", // ISO 8601 timestamp string
      // ... any other relevant data you want to track
    }
    ```

#### **Step 3: Building the API Endpoints**

Create a file named `server.js` and set up your Express server.

1.  **`POST /track-event` (Data Ingestion)**
    *   This endpoint will receive event data from the vendors' tracking scripts.
    *   It should validate that required fields like `vendorId` and `eventName` are present.
    *   It then inserts the validated event data into the `events` collection in your database.

2.  **`GET /data` (Data Serving)**
    *   This endpoint will serve all necessary data to the vendor's dashboard. It must be secured by `vendorId`.
    *   The request from the frontend will look like: `GET /data?vendorId=my-cool-store.com&period=last7days`.
    *   Your server will read the `vendorId` and other filter parameters from the URL query.
    *   It then uses these parameters to fetch the correct data from the database (event logs, event counts, top products), ensuring you only ever return data belonging to the requesting vendor.

---

### **Part 2: The Vendor Dashboard (Frontend)**

This is the website where vendors view their analytics. It can be built with simple HTML, CSS, and JavaScript.

#### **Step 1: The Login Page**

*   Create an `index.html` file.
*   This page should have a single text input field for the `vendorId` (e.g., "Your Store URL") and a "View Dashboard" button.
*   When the button is clicked, use JavaScript to save the `vendorId` to the browser's `localStorage` and redirect the user to `dashboard.html`.

    ```javascript
    // Example login.js
    const vendorId = document.getElementById('vendor-id-input').value;
    if (vendorId) {
        localStorage.setItem('vendorId', vendorId);
        window.location.href = '/dashboard.html';
    }
    ```

#### **Step 2: The Dashboard Page**

*   Create a `dashboard.html` file.
*   On this page, use JavaScript to:
    1.  Retrieve the `vendorId` from `localStorage`. If it's not there, redirect back to the login page.
    2.  Use the `fetch` API to make a request to your backend's `GET /data` endpoint, passing the `vendorId` and any filter values in the URL.
        ```javascript
        // Example dashboard.js
        const vendorId = localStorage.getItem('vendorId');
        const period = document.getElementById('period-filter').value;
        // ... get other filters

        fetch(`https://your-backend.com/data?vendorId=${vendorId}&period=${period}`)
            .then(response => response.json())
            .then(data => {
                // Use the data to render the stat cards, top product rows, and event table
            });
        ```
    3.  Implement the same filter controls (time period, event type) as in the original app. When the "Apply Filters" button is clicked, re-fetch the data with the new filter parameters in the URL.
    4.  Render the data from the server into the stat cards, scrollable top-product rows, and the main events table.

---

### **Part 3: The Vendor's Tracking Script**

This is the copy-pasteable script you will provide to your vendors.

#### **Step 1: The Script Logic**

Create a JavaScript file (`tracker.js`) that vendors will include on their site.

*   **Configuration:** The script must be easy for a vendor to configure with their unique `vendorId` and the URL of your backend server.

    ```javascript
    // tracker.js
    const YOUR_SERVER_URL = 'https://your-backend.com';
    const VENDOR_ID = 'my-cool-store.com'; // The vendor will change this
    ```

*   **`trackEvent` Function:** This core function gathers all the product data and sends it to your server.

    ```javascript
    async function trackEvent(eventData) {
        // Add the vendorId to every event
        const dataToSend = { ...eventData, vendorId: VENDOR_ID };

        try {
            await fetch(`${YOUR_SERVER_URL}/track-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });
        } catch (error) {
            console.error('Event tracking error:', error);
        }
    }
    ```

*   **Event Listeners:** Attach listeners to track events. This logic will depend on the vendor's site structure, so provide clear examples.

    ```javascript
    // Example: Track an "AddToCart" event
    const addToCartButton = document.querySelector('.add-to-cart-button');
    addToCartButton.addEventListener('click', () => {
        // Code to get product details (name, image, etc.)
        const productDetails = { /* ... */ };

        trackEvent({
            eventName: 'AddToCart',
            productName: productDetails.name,
            productImage: productDetails.image,
            productId: productDetails.id,
            timestamp: new Date().toISOString()
        });
    });
    ```

#### **Step 2: Installation Instructions for Vendors**

Provide clear instructions for your vendors:
1.  "Copy the `tracker.js` script and add it to your website."
2.  "In `tracker.js`, change the `VENDOR_ID` variable to your unique store URL or brand name: `const VENDOR_ID = 'your-store-url.com';`"
3.  "Place the following script tag at the bottom of your website's HTML, just before the closing `</body>` tag:"
    ```html
    <script src="/path/to/your/tracker.js"></script>
    ```

---
### **Next Steps & Security**

*   **Deployment:** You can host the backend server and frontend dashboard on platforms like Render, Heroku, or Vercel.
*   **Security:** The login method described here is very basic. For a production application, you would want a proper authentication system (e.g., username/password or OAuth) to protect vendor data.
*   **Error Handling:** Add robust error handling on both the client and server to handle cases where tracking fails or data is invalid.
