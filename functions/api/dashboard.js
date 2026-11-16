import {
    json,
    error,
    getSettings
} from "../_shared.js";

export async function onRequestGet(context) {
    try {
        const db = context.env.DB;

        if (!db) {
            return error("Banco de dados não configurado.", 500);
        }

        const settings = await getSettings(db);

        if (!settings) {
            return error("Configurações iniciais não encontradas. Execute o schema.sql.", 500);
        }

        const recent = await db.prepare(`
            SELECT *
            FROM (
                SELECT
                    id,
                    type,
                    boxes,
                    total_cents AS totalCents,
                    NULL AS amountCents,
                    created_at AS createdAt
                FROM transactions

                UNION ALL

                SELECT
                    id,
                    'payment' AS type,
                    NULL AS boxes,
                    NULL AS totalCents,
                    amount_cents AS amountCents,
                    created_at AS createdAt
                FROM payments
            )
            ORDER BY createdAt DESC, id DESC
            LIMIT 8
        `).all();

        return json({
            stockBoxes: Number(settings.stock_boxes),
            stockUnits: Number(settings.stock_boxes) * Number(settings.units_per_box),
            totalPurchasedCents: Number(settings.total_purchased_cents),
            totalPaidCents: Number(settings.total_paid_cents),
            openBalanceCents: Number(settings.open_balance_cents),
            recentTransactions: recent.results || []
        });
    } catch (err) {
        return error("Erro ao carregar o dashboard: " + err.message, 500);
    }
}