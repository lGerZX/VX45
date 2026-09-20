import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SUPPORT_SERVER_URL = "https://discord.gg/vx73";

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Obten el enlace al servidor de VX45"),

    async execute(interaction) {
        try {
            const supportButton = new ButtonBuilder()
                .setLabel("Unirse al servidor de VX45")
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL);

            const actionRow = new ActionRowBuilder().addComponents(supportButton);

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    createEmbed({ title: "Necesitas ayuda?", description: "Unete a nuestro servidor de soporte oficial para recibir ayuda reportar errores o sugerir funciones" }),
                ],
                components: [actionRow],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Support command error:', error);

            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: 'Error del sistema', description: 'No se pudo mostrar la informacion de soporte', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send error reply:', replyError);
            }
        }
    },
};
