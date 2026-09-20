import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MINE_COOLDOWN = 60 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    "mina de oro abandonada",
    "cueva oscura y humeda",
    "cantera de rocas",
    "respiradero de obsidiana volcanica",
    "fosa de minerales submarina",
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Ve a minar para ganar dinero'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastMine = userData.lastMine || 0;
        const hasDiamondPickaxe = userData.inventory["diamond_pickaxe"] || 0;
        const hasPickaxe = userData.inventory["pickaxe"] || 0;

        if (now < lastMine + MINE_COOLDOWN) {
            const remaining = lastMine + MINE_COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor(
                (remaining % (1000 * 60 * 60)) / (1000 * 60),
            );

            throw createError(
                "Mining cooldown active",
                ErrorTypes.RATE_LIMIT,
                `Tu pico se esta enfriando. Espera **${hours}h ${minutes}m** antes de volver a minar.`,
                { remaining, cooldownType: 'mine' }
            );
        }

        const baseEarned =
            Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
            ) + BASE_MIN_REWARD;

        let finalEarned = baseEarned;
        let multiplierMessage = "";

        if (hasDiamondPickaxe > 0) {
            finalEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
            multiplierMessage = `\n💎 **Bono por Pico de Diamante: +100%**`;
        } else if (hasPickaxe > 0) {
            finalEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
            multiplierMessage = `\n⛏️ **Bono por Pico: +20%**`;
        }

        const location =
            MINE_LOCATIONS[
                Math.floor(Math.random() * MINE_LOCATIONS.length)
            ];

        userData.wallet += finalEarned;
        userData.lastMine = now;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            "💰 ¡Expedicion de mineria exitosa!",
            `Exploraste una **${location}** y lograste encontrar minerales por un valor de **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
        )
            .addFields({
                name: "Nuevo saldo en efectivo",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            })
            .setFooter({ text: `Proxima mineria disponible en 1 hora.` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
};
