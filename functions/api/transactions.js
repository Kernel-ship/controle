import {
    json,
    error,
    parseBody,
    isPositiveInteger,
    getSettings
} from "../_shared.js";

export async function onRequestGet(context) {
    try {
        const db = context.env.DB;

        const result = await db.prepare(`
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
            LIMIT 500
        `).all();

        return json({
            transactions: result.results || []
        });
    } catch (err) {
        return error("Erro ao carregar o histórico: " + err.message, 500);
    }
}

export async function onRequestPost(context) {
    try {
        const db = context.env.DB;
        const body = await parseBody(context.request);

        if (!body) {
            return error("Dados inválidos.");
        }

        const { type, boxes } = body;

        if (!["purchase", "sale"].includes(type)) {
            return error("Tipo de operação inválido.");
        }

        if (!isPositiveInteger(boxes)) {
            return error("A quantidade de caixas deve ser um número inteiro maior que zero.");
        }

        if (boxes > 100000) {
            return error("Quantidade acima do limite permitido.");
        }

        const settings = await getSettings(db);

        if (!settings) {
            return error("Configurações do produto não encontradas.", 500);
        }

        if (type === "purchase") {
            const price = Number(settings.default_price_cents);

            if (!Number.isSafeInteger(price) || price <= 0) {
                return error("Configure um preço padrão válido antes de registrar compras.");
            }

            const total = price * boxes;

            if (!Number.isSafeInteger(total)) {
                return error("O valor total da compra é muito alto.");
            }

            await db.batch([
                db.prepare(`
                    INSERT INTO transactions (
                        type,
                        boxes,
                        unit_cost_cents,
                        total_cents
                    )
                    VALUES ('purchase', ?, ?, ?)
                `).bind(boxes, price, total),

                db.prepare(`
                    UPDATE settings
                    SET
                        stock_boxes = stock_boxes + ?,
                        total_purchased_cents = total_purchased_cents + ?,
                        open_balance_cents = open_balance_cents + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `).bind(boxes, total, total)
            ]);

            return json({
                success: true,
                message: "Compra registrada.",
                boxes,
                totalCents: total
            }, 201);
        }

        const results = await db.batch([
            db.prepare(`
                INSERT INTO transactions (
                    type,
                    boxes,
                    unit_cost_cents,
                    total_cents
                )
                SELECT 'sale', ?, NULL, NULL
                WHERE EXISTS (
                    SELECT 1
                    FROM settings
                    WHERE id = 1
                    AND stock_boxes >= ?
                )
            `).bind(boxes, boxes),

            db.prepare(`
                UPDATE settings
                SET
                    stock_boxes = stock_boxes - ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                AND stock_boxes >= ?
            `).bind(boxes, boxes)
        ]);

        const inserted = Number(results?.[0]?.meta?.changes || 0);
        const updated = Number(results?.[1]?.meta?.changes || 0);

        if (inserted !== 1 || updated !== 1) {
            return error("Estoque insuficiente. Atualize o painel e tente novamente.", 409);
        }

        return json({
            success: true,
            message: "Saída registrada.",
            boxes
        }, 201);

    } catch (err) {
        return error("Erro ao registrar operação: " + err.message, 500);
    }
}