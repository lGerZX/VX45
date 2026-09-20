import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "Transmision en vivo", min: 120, max: 450, risk: 0.2 },
    { name: "Sesion de baile privado", min: 220, max: 700, risk: 0.25 },
    { name: "Anfitrion de club nocturno", min: 320, max: 900, risk: 0.3 },
    { name: "Reserva de compania VIP", min: 550, max: 1400, risk: 0.35 },
    { name: "Transmision exclusiva", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "Tu transmision fue un exito y llegaron muchas propinas",
    "Una reserva VIP pago mucho mas del promedio",
    "Tu turno nocturno estuvo lleno y fue muy lucrativo",
    "Llegaron solicitudes premium y tu pago aumento",
];

const FINE_OUTCOMES = [
    "La seguridad del local aplico una multa de cumplimiento",
    "Una sancion de moderacion genero una tarifa de plataforma",
    "Fuiste marcado y tuviste que pagar una penalizacion",
];

const ROBBED_OUTCOMES = [
    "Un contracargo de un comprador falso borro parte de tus ganancias",
    "Una reserva falsa se llevo una parte de tu dinero",
    "Caiste en una cuenta fraudulenta y perdiste dinero",
];

const LOSS_OUTCOMES = [
    "El show fue un fracaso y tuviste que cubrir los costos de operacion",
    "Gastaste presupuesto en preparacion sin obtener ganancias",
    "El turno salio mal y quedaste en numeros rojos",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `${activity.name} - Pago`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `${activity.name} - Multado`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `${activity.name} - Robado`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `${activity.name} - Perdida`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Toma un trabajo de riesgo para ganar o perder dinero'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data for slut command",
                ErrorTypes.DATABASE,
                "Error al cargar tus datos de economia intentalo mas tarde",
                { userId, guildId }
            );
        }

        const lastSlut = userData.lastSlut || 0;

        if (now - lastSlut < SLUT_COOLDOWN) {
            const remainingTime = lastSlut + SLUT_COOLDOWN - now;
            throw createError(
                "Slut cooldown active",
                ErrorTypes.RATE_LIMIT,
                `Debes esperar antes de volver a trabajar Intenta de nuevo en **${Math.ceil(remainingTime / 60000)}** minutos`,
                { timeRemaining: remainingTime, cooldownType: 'slut' }
            );
        }

        const activity = randomChoice(SLUT_ACTIVITIES);

        const outcome = resolveOutcome(activity, userData.wallet || 0);

        userData.lastSlut = now;
        userData.totalSluts = (userData.totalSluts || 0) + 1;
        userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
        userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

        if (outcome.type !== 'payout') {
            userData.failedSluts = (userData.failedSluts || 0) + 1;
        }

        userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

        await setEconomyData(client, guildId, userId, userData);

        logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
            userId,
            guildId,
            activity: activity.name,
            outcomeType: outcome.type,
            amountDelta: outcome.delta,
            newWallet: userData.wallet,
            timestamp: new Date().toISOString()
        });

        const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
        const summaryLines = [
            `${outcome.message}`,
            `💸 **Resultado neto:** ${amountLabel}`,
            `💳 **Saldo actual:** $${userData.wallet.toLocaleString()}`,
            `📊 **Sesiones totales:** ${userData.totalSluts}`,
            `💵 **Total ganado:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
            `🧾 **Total perdido:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
        ];

        const embed = createEmbed({
            title: outcome.title,
            description: summaryLines.join('\n'),
            color: outcome.delta >= 0 ? 'success' : 'error',
            timestamp: true
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};
