import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Obtiene la hora actual en diferentes zonas horarias')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('La zona horaria a mostrar (por ejemplo UTC, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('en-US', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Zona horaria invalida solicitada: ${timezone}`);
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Zona horaria invalida. Usa un identificador valido (por ejemplo UTC, America/New_York, Europe/London)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 Hora actual',
                    `**${timezone}:** ${timeString}\n` +
                    `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                    `**ISO String:** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'No se pudo obtener la hora actual. Intentalo de nuevo.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};
