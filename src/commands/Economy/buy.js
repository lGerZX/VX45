import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Compra un objeto de la tienda')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID del objeto a comprar')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Cantidad a comprar (por defecto: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const itemId = interaction.options.getString("item_id").toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = SHOP_ITEMS.find(i => i.id === itemId);

        if (!item) {
            throw createError(
                `Item ${itemId} not found`,
                ErrorTypes.VALIDATION,
                `El objeto \`${itemId}\` no existe en la tienda`,
                { itemId }
            );
        }

        if (quantity < 1) {
            throw createError(
                "Invalid quantity",
                ErrorTypes.VALIDATION,
                "Debes comprar una cantidad de 1 o mas",
                { quantity }
            );
        }

        const totalCost = item.price * quantity;

        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.wallet < totalCost) {
            throw createError(
                "Insufficient funds",
                ErrorTypes.VALIDATION,
                `Necesitas **$${totalCost.toLocaleString()}** para comprar ${quantity}x **${item.name}**, pero solo tienes **$${userData.wallet.toLocaleString()}** en efectivo`,
                { required: totalCost, current: userData.wallet, itemId, quantity }
            );
        }

        if (item.type === "role" && itemId === "premium_role") {
            if (!PREMIUM_ROLE_ID) {
                throw createError(
                    "Premium role not configured",
                    ErrorTypes.CONFIGURATION,
                    "El **Rol de la tienda premium** aun no ha sido configurado por un administrador del servidor",
                    { itemId }
                );
            }
            if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                throw createError(
                    "Role already owned",
                    ErrorTypes.VALIDATION,
                    `Ya tienes el rol **${item.name}**`,
                    { itemId, roleId: PREMIUM_ROLE_ID }
                );
            }
            if (quantity > 1) {
                throw createError(
                    "Invalid quantity for role",
                    ErrorTypes.VALIDATION,
                    `Solo puedes comprar el rol **${item.name}** una vez`,
                    { itemId, quantity }
                );
            }
        }

        userData.wallet -= totalCost;

        let successDescription = `Compraste exitosamente ${quantity}x **${item.name}** por **$${totalCost.toLocaleString()}**`;

        if (item.type === "role" && itemId === "premium_role") {
            const member = interaction.member;

            const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

            if (!role) {
                throw createError(
                    "Role not found",
                    ErrorTypes.CONFIGURATION,
                    "El rol premium configurado ya no existe en este servidor",
                    { roleId: PREMIUM_ROLE_ID }
                );
            }

            try {
                await member.roles.add(
                    role,
                    `Purchased role: ${item.name}`,
                );
                successDescription += `\n\n**👑 El rol ${role.toString()} te ha sido otorgado**`;
            } catch (roleError) {
                userData.wallet += totalCost;
                await setEconomyData(client, guildId, userId, userData);
                throw createError(
                    "Role assignment failed",
                    ErrorTypes.DISCORD_API,
                    "Se desconto el dinero correctamente pero no se pudo otorgar el rol Tu dinero ha sido reembolsado",
                    { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                );
            }
        } else if (item.type === "upgrade") {
            userData.upgrades[itemId] = true;
            successDescription += `\n\n**✨ Tu mejora ya esta activa**`;
        } else if (item.type === "consumable" || item.type === "tool") {
            userData.inventory[itemId] =
                (userData.inventory[itemId] || 0) + quantity;
            if (item.type === "tool") {
                successDescription += `\n\n**🛠️ ${item.name} agregado a tu inventario**`;
            }
        }

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            "💰 Compra exitosa",
            successDescription,
        ).addFields({
            name: "Nuevo saldo",
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};
