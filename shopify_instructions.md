# Instructions to Track Facebook Events in Your Shopify Theme

You're all set on the server side. Now, you need to add a script to your Shopify theme to capture Facebook Pixel events and send them to your app.

## 1. Upload the tracking script to your theme:

1.  From your Shopify admin, navigate to **Online Store > Themes**.
2.  Find the theme you want to edit, click the **Actions** button (the one with `...`), and select **Edit code**.
3.  In the code editor's file list on the left, expand the **Assets** directory.
4.  Click **Add a new asset**.
5.  In the dialog that appears, click the **Choose File** button and select the `fb_event_tracker.js` file located in the `public/js/` directory of this project.
6.  Click **Upload asset**.

## 2. Include the script in your theme layout:

1.  While still in the code editor, find and open the `theme.liquid` file located in the **Layout** directory.
2.  Scroll down to the very bottom of the file.
3.  Just before the closing `</body>` tag, paste the following line of code:

    ```html
    <script src="{{ 'fb_event_tracker.js' | asset_url }}" defer="defer"></script>
    ```

4.  Click **Save**.

## 3. IMPORTANT: Configure the Server URL

For the tracking to work, the script needs to know where to send the data.

1.  In the Shopify code editor, open the `fb_event_tracker.js` file you uploaded to the **Assets** directory.
2.  Find the following line at the top of the file:

    ```javascript
    const APP_URL = 'https://your-app-server.com'; 
    ```

3.  **Change `'https://your-app-server.com'` to the actual, public URL of your deployed application.** For example, if you deployed your app on a service like Render or Heroku, this would be the URL they provide (e.g., `https://my-commission-app.onrender.com`).

4.  Click **Save**.

Once you have completed these steps, the script will automatically start listening for `ViewContent` (when a user visits a product page) and `AddToCart` (when a user clicks an add-to-cart button) events and send them to your server to be stored in the database.
