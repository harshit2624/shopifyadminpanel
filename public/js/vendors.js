document.addEventListener('DOMContentLoaded', () => {
    // --- Helper function to decode HTML entities ---
    function decodeHtml(html) {
        if (!html || typeof html !== 'string') {
            return '';
        }
        var txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    // --- Helper function to perform the sync POST request ---
    async function sync(vendorId, products, button) {
        const originalText = button.textContent;
        const syncType = button.dataset.syncType;

        button.textContent = 'Syncing...';
        button.disabled = true;

        const statusContainer = document.querySelector(`.sync-status[data-vendor-id="${vendorId}"]`);
        const logsContainer = statusContainer.querySelector('.sync-logs');
        const loadingIndicator = statusContainer.querySelector('.loading-indicator');

        statusContainer.style.display = 'block';
        logsContainer.textContent = '';
        loadingIndicator.style.display = 'block';

        const productsToSync = products.map(p => ({
            ...p,
            body_html: decodeHtml(p.body_html)
        }));

        let endpoint = '/vendors/sync-products';
        if (syncType === 'inventory') {
            endpoint = '/vendors/sync-inventory';
        } else if (syncType === 'photos') {
            endpoint = '/vendors/sync-photos';
        } else if (syncType === 'full') {
            endpoint = '/vendors/sync-products';
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorId, products: productsToSync })
            });

            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ message: 'An unknown error occurred during sync.' }));
                throw new Error(errorResult.message);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    logsContainer.textContent += '\nSync complete!';
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                logsContainer.textContent += chunk;
            }
            
            button.textContent = 'Synced!';

        } catch (error) {
            console.error('Sync failed:', error);
            button.textContent = 'Sync Failed';
            logsContainer.textContent += `\n\nError: ${error.message}`;
        } finally {
            loadingIndicator.style.display = 'none';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                statusContainer.style.display = 'none';
            }, 5000);
        }
    }

    // --- Event listener for "Select All" checkboxes ---
    document.querySelectorAll('.select-all-vendor-products').forEach(selectAllCheckbox => {
        selectAllCheckbox.addEventListener('change', (event) => {
            const vendorId = event.target.dataset.vendorId;
            const isChecked = event.target.checked;
            document.querySelectorAll(`.product-row[data-vendor-id="${vendorId}"] .product-checkbox`).forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        });
    });

    // --- Generic Event listener for all sync buttons ---
    document.querySelectorAll('.sync-selected-btn, .sync-all-btn, .sync-inventory-btn, .sync-photos-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const button = event.target;
            const vendorId = button.dataset.vendorId;
            let products = [];

            if (button.classList.contains('sync-all-btn')) {
                const allProductRows = document.querySelectorAll(`.product-row[data-vendor-id="${vendorId}"]`);
                if (allProductRows.length === 0) {
                    alert('No products found for this vendor.');
                    return;
                }
                products = Array.from(allProductRows).map(row => {
                    return JSON.parse(row.dataset.product);
                });
            } else {
                const selectedRows = document.querySelectorAll(`.product-row[data-vendor-id="${vendorId}"] .product-checkbox:checked`);
                if (selectedRows.length === 0) {
                    alert('Please select at least one product to sync.');
                    return;
                }
                products = Array.from(selectedRows).map(row => {
                    return JSON.parse(row.closest('.product-row').dataset.product);
                });
            }

            await sync(vendorId, products, button);
        });
    });

    // --- Event listener for "Fetch Products" buttons ---
    document.querySelectorAll('.fetch-products-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const vendorId = event.target.dataset.vendorId;
            const button = event.target;
            button.textContent = 'Fetching...';
            button.disabled = true;

            try {
                const response = await fetch(`/vendors/${vendorId}/products`);
                if (!response.ok) {
                    throw new Error('Failed to fetch products.');
                }
                window.location.reload();
            } catch (error) {
                console.error('Fetch failed:', error);
                button.textContent = 'Fetch Failed';
                alert(`Product fetch failed: ${error.message}`);
                setTimeout(() => {
                    button.textContent = 'Fetch Products';
                    button.disabled = false;
                }, 2000);
            }
        });
    });
});