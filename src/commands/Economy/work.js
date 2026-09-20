import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/bot.js';

const WORK_COOLDOWN = botConfig.economy?.cooldowns?.work ?? 30 * 60 * 1000;
const MIN_WORK_AMOUNT = botConfig.economy?.workMin ?? 10;
const MAX_WORK_AMOUNT = botConfig.economy?.workMax ?? 100;
const LAPTOP_MULTIPLIER = 1.5;
const WORK_JOBS = [
    "Desarrollador de Software",
    "Barista",
    "Conserje",
    "YouTuber",
    "Desarrollador de Bots de Discord",
    "Cajero",
    "Repartidor de Pizza",
    "Bibliotecario",
    "Jardinero",
    "Analista de Datos",
];

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Trabaja para ganar algo de dinero'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data for work",
                ErrorTypes.DATABASE,
                "Error al cargar tus datos de economia intentalo mas tarde",
                { userId, guildId }
            );
        }

        logger.debug(`[ECONOMY] Work command started for ${userId}`, { userId, guildId });

        const lastWork = userData.lastWork || 0;
        const inventory = userData.inventory || {};
        const extraWorkShifts = inventory["extra_work"] || 0;
        const hasLaptop = inventory["laptop"] || 0;

        let cooldownActive = now < lastWork + WORK_COOLDOWN;
        let usedConsumable = false;

        if (cooldownActive) {
            if (extraWorkShifts > 0) {
                inventory["extra_work"] = (inventory["extra_work"] || 0) - 1;
                usedConsumable = true;
            } else {
                const remaining = lastWork + WORK_COOLDOWN - now;
                throw createError(
                    "Work cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Estas trabajando muy rapido Espera **${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m** antes de volver a trabajar`,
                    { timeRemaining: remaining, cooldownType: 'work' }
                );
            }
        }

        let earned = Math.floor(Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1)) + MIN_WORK_AMOUNT;
        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

        let multiplierMessage = "";
        if (hasLaptop > 0) {
            earned = Math.floor(earned * LAPTOP_MULTIPLIER);
            multiplierMessage = "\n💻 **Bono de Laptop:** +50% de ganancias!";
        }

        userData.wallet = (userData.wallet || 0) + earned;
        userData.lastWork = now;

        await setEconomyData(client, guildId, userId, userData);

        logger.info(`[ECONOMY_TRANSACTION] Work completed`, {
            userId,
            guildId,
            amount: earned,
            job,
            usedConsumable,
            hasLaptop: hasLaptop > 0,
            newWallet: userData.wallet,
            timestamp: new Date().toISOString()
        });

        const embed = successEmbed(
            "💼 Trabajo completado",
            `Trabajaste como **${job}** y ganaste **$${earned.toLocaleString()}**!${multiplierMessage}`
        )
            .addFields(
                {
                    name: "Nuevo saldo",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Proximo trabajo",
                    value: `<t:${Math.floor((now + WORK_COOLDOWN) / 1000)}:R>`,
                    inline: true,
                }
            )
            .setFooter({
                text: `Solicitado por ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL(),
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'work' })
};
