document.addEventListener('DOMContentLoaded', () => {
    const saveButtons = document.querySelectorAll('.save-btn');

    saveButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            const row = event.target.closest('tr');
            const orderId = row.dataset.orderId;
            const vendorId = row.querySelector('.vendor-select').value;
            const manualShipping = row.querySelector('.manual-shipping').value;
            const discountType = row.querySelector('.discount-type').value;
            const manualDiscount = row.querySelector('.manual-discount').value;
            const amountReceived = row.querySelector('.amount-received').value;
            const commissionPercentage = row.querySelector('.manual-commission').value;

            const response = await fetch('/invoices/assign-vendor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    order_id: orderId,
                    vendor_id: vendorId,
                    manual_shipping: manualShipping,
                    discount_type: discountType,
                    manual_discount: manualDiscount,
                    amount_received: amountReceived,
                    commission_percentage: commissionPercentage
                })
            });

            const result = await response.json();
            if (result.success) {
                alert('Saved successfully!');
                row.classList.remove('order-unsaved');
                row.classList.add('order-saved');
            } else {
                alert('Error saving data: ' + result.error);
            }
        });
    });

    const cancelButtons = document.querySelectorAll('.cancel-btn');
    cancelButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            const row = event.target.closest('tr');
            const orderId = row.dataset.orderId;

            const response = await fetch('/invoices/mark-as-canceled', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId })
            });

            const result = await response.json();
            if (result.success) {
                alert('Order marked as canceled.');
                row.className = 'order-canceled';
                row.querySelectorAll('button').forEach(btn => btn.disabled = true);
            } else {
                alert('Error: ' + result.error);
            }
        });
    });

    const settleButtons = document.querySelectorAll('.settle-btn');
    settleButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            const row = event.target.closest('tr');
            const orderId = row.dataset.orderId;

            const response = await fetch('/invoices/mark-as-settled', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId })
            });

            const result = await response.json();
            if (result.success) {
                alert('Order marked as settled.');
                row.className = 'order-settled';
                row.querySelectorAll('button').forEach(btn => btn.disabled = true);
            } else {
                alert('Error: ' + result.error);
            }
        });
    });

    const saveManualInvoiceBtn = document.getElementById('save-manual-invoice');
    if (saveManualInvoiceBtn) {
        saveManualInvoiceBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            const form = document.getElementById('manual-invoice-form');
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            const response = await fetch('/invoices/save-manual', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(data).toString()
            });

            const result = await response.json();
            if (result.success) {
                alert('Manual invoice saved successfully!');
                location.reload();
            } else {
                alert('Error saving manual invoice: ' + result.error);
            }
        });
    }
});