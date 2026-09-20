import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Mira tu inventario de economia'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Inventory requested for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data for inventory",
                ErrorTypes.DATABASE,
                "No se pudieron cargar tus datos de economia. Por favor, intentalo de nuevo mas tarde.",
                { userId, guildId }
            );
        }

        const inventory = userData.inventory || {};

        const validItems = Object.entries(inventory)
            .filter(([itemId, quantity]) => {
                const item = SHOP_ITEMS.find(i => i.id === itemId);
                return quantity > 0 && item;
            })
            .map(([itemId, quantity]) => {
                const item = SHOP_ITEMS.find(i => i.id === itemId);
                return `**${item.name}:** x${quantity}`;
            });

        const inventoryDescription = validItems.length > 0
            ? validItems.join("\n")
            : "Tu inventario esta actualmente vacio.";

        logger.info(`[ECONOMY] Inventory retrieved`, { 
            userId, 
            guildId,
            itemCount: validItems.length
        });

        const embed = createEmbed({ 
            title: `🎒 Inventario de ${interaction.user.username}`, 
            description: inventoryDescription, 
        }).setThumbnail(interaction.user.displayAvatarURL());

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'inventory' })
};
