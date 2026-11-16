
import {
    json,
    error,
    parseBody,
    isNonNegativeInteger,
    formatSettings,
    getSettings
} from "../_shared.js";

export async function onRequestGet(context) {
    try {
        const settings = await getSettings(context.env.DB);

        if (!settings) {
            return error("Configurações iniciais não encontradas. Execute o schema.sql.", 500);
        }

        return json({
            settings: formatSettings(settings)
        });
    } catch (err) {
        return error("Erro ao carregar configurações: " + err.message, 500);
    }
}

export async function onRequestPut(context) {
    try {
        const db = context.env.DB;
        const body = await parseBody(context.request);

        if (!body) {
            return error("Dados inválidos.");
        }

        const productName = String(body.productName || "").trim();
        const defaultPriceCents = body.defaultPriceCents;

        if (!productName || productName.length > 80) {
            return error("O nome do produto deve ter entre 1 e 80 caracteres.");
        }

        if (
            !isNonNegativeInteger(defaultPriceCents) ||
            defaultPriceCents <= 0 ||
            defaultPriceCents > 100000000
        ) {
            return error("Informe um preço padrão válido.");
        }

        await db.prepare(`
            UPDATE settings
            SET
                product_name = ?,
                default_price_cents = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `).bind(productName, defaultPriceCents).run();

        const updatedSettings = await getSettings(db);

        return json({
            success: true,
            message: "Configurações atualizadas.",
            settings: formatSettings(updatedSettings)
        });

    } catch (err) {
        return error("Erro ao salvar configurações: " + err.message, 500);
    }
}
