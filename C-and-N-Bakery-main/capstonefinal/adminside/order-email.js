// EMAILJS ID's
const EMAILJS_SERVICE_ID = "";   // EmailJS service
const EMAILJS_TEMPLATE_ID = "template_xh0chdq";  // Order confirmation template
const EMAILJS_DOWNPAY_TMPL_ID = "template_5mznngl";  // Downpayment received template
const EMAILJS_SHIP_TMPL_ID = "template_xh0chdq";  // Shipped / ready for pickup template

/**
 * Checks whether an order item is a Custom Cake.
 * @param   {Object}  item 
 * @returns {boolean} //True if the item is considered a custom cake
 */
function isCustomItem(item) {
    const cat = (item.category || '').toLowerCase().trim();
    const name = (item.name || '').toLowerCase().trim();
    return cat.includes('custom') || name.includes('custom');
}

/**
 * Calculates the 50% downpayment amount for Custom Cake items only.
 *
 * Priority logic:
 *  1. If custom items have stored prices → 50% of their subtotal
 *  2. If order has a stored downpayment field → use that value
 *  3. Last resort → 50% of the full order total
 *
 * @param   {Object} order - Full order object from Firebase
 * @returns {string} Downpayment amount fixed to 2 decimal places (e.g. "250.00")
 */
function calcCustomDownpayment(order) {
    const items = order.items || [];
    const customItems = items.filter(isCustomItem);

    // Check if any custom item has a stored price we can calculate from
    const hasPrice = customItems.some(i => parseFloat(i.price) > 0);

    if (hasPrice) {
        // Sum up: price × quantity for each custom item, then take 50%
        const subtotal = customItems.reduce((sum, i) => {
            return sum + (parseFloat(i.price || 0) * (i.quantity || 1));
        }, 0);
        return (subtotal * 0.5).toFixed(2);
    }

    // Use the pre-computed downpayment value saved on the order, if available
    if (order.downpayment) return parseFloat(order.downpayment).toFixed(2);

    // No item prices and no stored downpayment — fall back to 50% of total
    return (parseFloat(order.totalAmount || 0) * 0.5).toFixed(2);
}

/**
 * Builds a human-readable list of order items for use inside email templates.
 * Each line follows the format: "{qty}x {name} ({category})"
 *
 * @param   {Array}   items      - Array of order item objects (default: empty array)
 * @param   {boolean} customOnly - If true, only Custom Cake items are included
 * @returns {string}  Newline-separated item list, e.g. "2x Chocolate Cake (Custom Cakes)"
 */
function buildItemList(items = [], customOnly = false) { // item list
    const list = customOnly ? items.filter(isCustomItem) : items;
    return list
        .map(i => `${i.quantity || 1}x ${i.name} (${i.category || 'Item'})`)
        .join('\n');
}

// ── Email Senders ─────────────────────────────────────────────────────────────

/**
 * 
 * ORDER CONFIRMATION
 *
 * @param {Object} order   
 * @param {string} orderId 
 * @param {string} email   
 */
export function sendConfirmationEmail(order, orderId, email) {
    const payload = {
        to_email: email,
        customer_name: order.customerName || 'Customer',
        order_id: orderId,
        order_date: order.date || '—',
        fulfillment_method: order.method || '—',
        address: order.address || 'Store Pickup',
        payment_method: order.paymentMethod || '—',
        payment_status: order.paymentStatus || '—',
        order_total: order.totalAmount || 0,
        order_items: buildItemList(order.items), // all items in the order
        status: 'confirmed',
        message: '✅ Your order has been confirmed by our team! We will begin preparing it soon.'
    };

    return emailjs
        .send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, payload)
        .then(() => console.log(`[order-email] Confirmation email sent to ${email}`))
        .catch(err => console.error('[order-email] Failed to send confirmation email:', err));
}

/** DOWNPAYMENT EMAIL
 * 
 * Used for orders that contain Custom Cake items, which require a 50% downpayment upfront.
 * - downpayment_amount is calculated from custom cake items only (see calcCustomDownpayment)
 * - All order items are listed so the customer sees their full order at a glance
 *
 * @param {Object} order   - Full order object from Firebase
 * @param {string} orderId - Firebase key for the order
 * @param {string} email   - Customer's email address
 */
export function sendDownpaymentEmail(order, orderId, email) {
    const payload = {
        to_email: email,
        customer_name: order.customerName || 'Customer',
        order_id: orderId,
        order_date: order.date || '—',
        fulfillment_method: order.method || '—',
        address: order.address || 'Store Pickup',
        payment_method: order.paymentMethod || '—',
        order_total: order.totalAmount || 0,
        downpayment_amount: calcCustomDownpayment(order),  // 50% of custom cake subtotal
        order_items: buildItemList(order.items),    // all items
        message: '✅ We have received your downpayment for your custom cake(s)! Your order is now being processed. The remaining balance is due upon pickup or delivery.'
    };

    return emailjs
        .send(EMAILJS_SERVICE_ID, EMAILJS_DOWNPAY_TMPL_ID, payload)
        .then(() => console.log(`[order-email] Downpayment email sent to ${email}`))
        .catch(err => console.error('[order-email] Failed to send downpayment email:', err));
}

/**
 * DELIVERY/PICKUP EMAIL
 * 
 *   - "delivery" → "Your order is out for delivery!"
 *   - "pickup"   → "Your order is ready for pickup!"
 *
 * @param {Object} order  //connected to the database
 * @param {string} orderId 
 * @param {string} email   
 */
export function sendShipEmail(order, orderId, email) {
    const method = (order.method || '').toLowerCase();
    const isDelivery = method.includes('delivery');

    const subject = isDelivery
        ? 'Your order is out for delivery!'
        : 'Your order is ready for pickup!';

    const message = isDelivery
        ? 'Your order is now out for delivery. Please be available to receive it.'
        : 'Your order is ready for pickup! Please visit our store at your scheduled time to collect it.';

    const payload = {
        to_email: email,
        customer_name: order.customerName || 'Customer',
        order_id: orderId.slice(-6), 
        order_date: order.date || '—',
        fulfillment_method: order.method || '—',
        address: order.address || 'Store Pickup',
        payment_method: order.paymentMethod || '—',
        payment_status: order.paymentStatus || '—',
        order_total: order.totalAmount || 0,
        order_items: buildItemList(order.items),
        email_subject: subject,
        message: message
    };

    return emailjs
        .send(EMAILJS_SERVICE_ID, EMAILJS_SHIP_TMPL_ID, payload)
        .then(() => console.log(`[order-email] Ship email sent to ${email}`))
        .catch(err => console.error('[order-email] Failed to send ship email:', err));
}