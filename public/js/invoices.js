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
                    amount_received: amountReceived
                })
            });

            const result = await response.json();
            if (result.success) {
                alert('Saved successfully!');
                // Optionally, you can provide some visual feedback here
                event.target.style.backgroundColor = '#2c974b';
                setTimeout(() => {
                    event.target.style.backgroundColor = '#2ea44f';
                }, 2000);
            } else {
                alert('Error saving data: ' + result.error);
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
                form.reset();
            } else {
                alert('Error saving manual invoice: ' + result.error);
            }
        });
    }
});