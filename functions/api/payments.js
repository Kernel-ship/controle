
import {
    json,
    error,
    parseBody,
    isPositiveInteger,
    getSettings
}  from "./_shared.js";

export async function onRequestPost(context) {
    try {
        const db = context.env.DB;
        const body = await parseBody(context.request);

        if (!body) {
            return error("Dados inválidos.");
        }

        const amountCents = body.amountCents;

        if (!isPositiveInteger(amountCents)) {
            return error("Informe um valor de pagamento válido em centavos.");
        }

        if (amountCents > 100000000000) {
            return error("Valor de pagamento acima do limite permitido.");
        }

        const settings = await getSettings(db);

        if (!settings) {
            return error("Configurações não encontradas.", 500);
        }

        if (amountCents > Number(settings.open_balance_cents)) {
            return error("O pagamento não pode ser maior que o saldo em aberto.", 409);
        }

        const results = await db.batch([
            db.prepare(`
                INSERT INTO payments (amount_cents)
                SELECT ?
                WHERE EXISTS (
                    SELECT 1
                    FROM settings
                    WHERE id = 1
                    AND open_balance_cents >= ?
                )
            `).bind(amountCents, amountCents),

            db.prepare(`
                UPDATE settings
                SET
                    total_paid_cents = total_paid_cents + ?,
                    open_balance_cents = open_balance_cents - ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                AND open_balance_cents >= ?
            `).bind(amountCents, amountCents, amountCents)
        ]);

        const inserted = Number(results?.[0]?.meta?.changes || 0);
        const updated = Number(results?.[1]?.meta?.changes || 0);

        if (inserted !== 1 || updated !== 1) {
            return error("O saldo em aberto mudou. Atualize o painel e tente novamente.", 409);
        }

        return json({
            success: true,
            message: "Pagamento registrado.",
            amountCents
        }, 201);

    } catch (err) {
        return error("Erro ao registrar pagamento: " + err.message, 500);
    }
}
