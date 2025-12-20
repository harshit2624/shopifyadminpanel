document.addEventListener('DOMContentLoaded', () => {
    // --- Helper function to perform the sync POST request ---
    async function syncProducts(vendorId, products, button) {
        const originalText = button.textContent;
        button.textContent = 'Syncing...';
        button.disabled = true;

        const statusContainer = document.querySelector(`.sync-status[data-vendor-id="${vendorId}"]`);
        const logsContainer = statusContainer.querySelector('.sync-logs');
        const loadingIndicator = statusContainer.querySelector('.loading-indicator');

        statusContainer.style.display = 'block';
        logsContainer.textContent = '';
        loadingIndicator.style.display = 'block'; // Assuming CSS for loading indicator exists

        try {
            const response = await fetch('/vendors/sync-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorId, products })
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
            }, 5000); // Keep logs visible for 5 seconds
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

    // --- Event listener for "Sync Selected" buttons ---
    document.querySelectorAll('.sync-selected-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const vendorId = event.target.dataset.vendorId;
            const selectedRows = document.querySelectorAll(`.product-row[data-vendor-id="${vendorId}"] .product-checkbox:checked`);
            
            if (selectedRows.length === 0) {
                alert('Please select at least one product to sync.');
                return;
            }

            const selectedProducts = Array.from(selectedRows).map(row => {
                return JSON.parse(row.closest('.product-row').dataset.product);
            });

            await syncProducts(vendorId, selectedProducts, button);
        });
    });

    // --- Event listener for "Sync All" buttons ---
    document.querySelectorAll('.sync-all-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const vendorId = event.target.dataset.vendorId;
            const allProductRows = document.querySelectorAll(`.product-row[data-vendor-id="${vendorId}"]`);
            
            if (allProductRows.length === 0) {
                alert('No products found for this vendor.');
                return;
            }

            const allProducts = Array.from(allProductRows).map(row => {
                return JSON.parse(row.dataset.product);
            });

            await syncProducts(vendorId, allProducts, button);
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
                // Reload the page to show the fetched products in the other tab.
                // A more advanced implementation could update the DOM without a full reload.
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