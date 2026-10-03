import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Establece el nivel de prioridad para el ticket de soporte actual")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("El nivel de prioridad para el ticket")
                .setRequired(true)
                .addChoices(
                    { name: "Urgente", value: "urgent" },
                    { name: "Alta", value: "high" },
                    { name: "Media", value: "medium" },
                    { name: "Baja", value: "low" },
                    { name: "Ninguna", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Este comando solo puede usarse en un canal de ticket valido' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas el permiso `Manage Channels` o el rol configurado `Ticket Staff Role` para cambiar la prioridad del ticket' });
        }

        const priorityLevel = interaction.options.getString("level");
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Prioridad actualizada",
                    `La prioridad del ticket se establecio en **${priorityLevel.toUpperCase()}**`,
                ),
            ],
        });

        logger.info('Ticket priority updated successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};
