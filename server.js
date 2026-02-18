// ============= FORMAT FREIGHT COST =============
function formatFreightCost(cost) {
    // Handle undefined, null, or empty values
    if (cost === undefined || cost === null || cost === '') {
        return '£0.00';
    }
    
    // Convert to number if it's a string
    const numCost = typeof cost === 'string' ? parseFloat(cost) : cost;
    
    // Check if it's a valid number
    if (isNaN(numCost)) {
        return '£0.00';
    }
    
    // Format with 2 decimal places
    return '£' + numCost.toFixed(2);
}

// ============= GET FREIGHT COST CLASS =============
function getFreightCostClass(cost) {
    // Handle undefined, null, or empty values
    if (cost === undefined || cost === null || cost === '') {
        return 'freight-cost-zero';
    }
    
    // Convert to number if it's a string
    const numCost = typeof cost === 'string' ? parseFloat(cost) : cost;
    
    // Check if it's zero or invalid
    if (isNaN(numCost) || numCost === 0) {
        return 'freight-cost-zero';
    }
    
    return 'freight-cost';
}

// ============= DISPLAY SHIPMENT DETAILS =============
function displayShipmentDetails(shipment) {
    const resultDiv = document.getElementById('trackingResult');
    
    const statusClass = shipment.status ? shipment.status.toLowerCase().replace(/ /g, '') : 'pending';
    
    let progress = 0;
    switch(shipment.status?.toLowerCase()) {
        case 'pending': progress = 10; break;
        case 'on hold': progress = 20; break;
        case 'out for delivery': progress = 80; break;
        case 'delivered': progress = 100; break;
        default: progress = 50;
    }

    let historyHtml = '';
    if (shipment.trackingHistory && shipment.trackingHistory.length > 0) {
        const sortedHistory = [...shipment.trackingHistory].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        sortedHistory.forEach(history => {
            const date = history.timestamp ? new Date(history.timestamp).toLocaleString() : 'N/A';
            
            const remarkHtml = history.remark ? 
                `<div class="history-remark">
                    <strong>📝 REMARKS:</strong> ${history.remark}
                </div>` : '';
            
            historyHtml += `
                <div class="history-item">
                    <span class="history-date">${date}</span>
                    <span class="history-status">${history.status || 'N/A'}</span>
                    <span class="history-location">📍 ${history.location || 'N/A'}</span>
                    ${history.message ? `<div style="color: #ccc; margin-top: 5px;">💬 ${history.message}</div>` : ''}
                    ${remarkHtml}
                </div>
            `;
        });
    }

    const departureDate = shipment.departureDate ? new Date(shipment.departureDate).toLocaleDateString() : 'N/A';
    const pickupDate = shipment.pickupDate ? new Date(shipment.pickupDate).toLocaleDateString() : 'N/A';
    const expectedDelivery = shipment.expectedDelivery ? new Date(shipment.expectedDelivery).toLocaleDateString() : 'N/A';
    
    const freightDisplay = formatFreightCost(shipment.freightCost);
    const freightClass = getFreightCostClass(shipment.freightCost);

    resultDiv.innerHTML = `
        <div class="tracking-header">
            <span class="tracking-number">Tracking #: ${shipment.trackingNumber || 'N/A'}</span>
            <span class="tracking-status status-${statusClass}">${shipment.status || 'Pending'}</span>
        </div>

        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%;"></div>
        </div>

        <div class="tracking-grid">
            <div class="info-card">
                <h3>📦 Shipment Details</h3>
                <div class="info-row">
                    <span class="info-label">Departure:</span>
                    <span class="info-value">${departureDate}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Pickup:</span>
                    <span class="info-value">${pickupDate}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Package Type:</span>
                    <span class="info-value">${shipment.packageType || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Package Status:</span>
                    <span class="info-value">${shipment.packageStatus || 'N/A'}</span>
                </div>
            </div>

            <div class="info-card">
                <h3>📋 Package Details</h3>
                <div class="info-row">
                    <span class="info-label">Description:</span>
                    <span class="info-value">${shipment.description || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Quantity:</span>
                    <span class="info-value">${shipment.quantity || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Weight:</span>
                    <span class="info-value">${shipment.weight || 'N/A'} kg</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Dimensions:</span>
                    <span class="info-value">${shipment.length || 'N/A'}x${shipment.width || 'N/A'}x${shipment.height || 'N/A'} cm</span>
                </div>
            </div>

            <div class="info-card">
                <h3>📍 Location Info</h3>
                <div class="info-row">
                    <span class="info-label">Origin:</span>
                    <span class="info-value">${shipment.origin || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Destination:</span>
                    <span class="info-value">${shipment.destination || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Carrier:</span>
                    <span class="info-value">${shipment.carrier || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Type:</span>
                    <span class="info-value">${shipment.shipmentType || 'N/A'}</span>
                </div>
            </div>

            <div class="info-card">
                <h3>👤 Recipient</h3>
                <div class="info-row">
                    <span class="info-label">Name:</span>
                    <span class="info-value">${shipment.recipientName || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Phone:</span>
                    <span class="info-value">${shipment.recipientPhone || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Address:</span>
                    <span class="info-value">${shipment.deliveryAddress || 'N/A'}</span>
                </div>
            </div>

            <div class="info-card">
                <h3>💳 Payment Info</h3>
                <div class="info-row">
                    <span class="info-label">Mode:</span>
                    <span class="info-value">${shipment.paymentMode || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Freight Cost:</span>
                    <span class="info-value ${freightClass}">${freightDisplay}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Expected:</span>
                    <span class="info-value">${expectedDelivery}</span>
                </div>
                ${shipment.paymentMode === 'freight' ? 
                    '<div class="info-row"><span class="info-value" style="color: #ffa500;">⚠️ Collect on delivery</span></div>' : ''}
            </div>
        </div>

        <div class="history-section">
            <h3 style="color: #00ffff; margin-bottom: 1rem;">📜 Tracking History</h3>
            <div class="history-timeline">
                ${historyHtml || '<p style="color: #888; text-align: center;">No tracking history available</p>'}
            </div>
        </div>
    `;
}