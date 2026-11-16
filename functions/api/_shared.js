
export function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}

export function error(message, status = 400) {
    return json({ error: message }, status);
}

export async function parseBody(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

export function isPositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

export function isNonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

export async function getSettings(db) {
    return await db.prepare(`
        SELECT
            product_name,
            default_price_cents,
            units_per_box,
            stock_boxes,
            total_purchased_cents,
            total_paid_cents,
            open_balance_cents
        FROM settings
        WHERE id = 1
    `).first();
}

export function formatSettings(row) {
    if (!row) return null;

    return {
        productName: row.product_name,
        defaultPriceCents: Number(row.default_price_cents),
        unitsPerBox: Number(row.units_per_box),
        stockBoxes: Number(row.stock_boxes),
        totalPurchasedCents: Number(row.total_purchased_cents),
        totalPaidCents: Number(row.total_paid_cents),
        openBalanceCents: Number(row.open_balance_cents)
    };
}

export function formatTransaction(row) {
    return {
        id: Number(row.id),
        type: row.type,
        boxes: row.boxes === null ? null : Number(row.boxes),
        totalCents: row.total_cents === null ? null : Number(row.total_cents),
        amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
        createdAt: row.created_at
    };
}
