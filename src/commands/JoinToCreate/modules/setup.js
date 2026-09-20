import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Join to Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                '✅ Configuración de Join to Create completada',
                `Canal activador creado: ${triggerChannel}\n\n` +
                `**Ajustes:**\n` +
                `• Plantilla del nombre del canal temporal: \`${nameTemplate}\`\n` +
                `• Límite de usuarios: ${userLimit === 0 ? 'Sin límite' : userLimit + ' usuarios'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ? `• Categoría: ${category.name}` : '• Categoría: Ninguna (nivel raíz)'}\n\n` +
                `Cuando los usuarios se unan a este canal, se creará un canal de voz temporal para ellos.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error al responder a la interacción:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('Todos los intentos de respuesta fallaron:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error en la configuración de JoinToCreate:', error);
            throw new TitanBotError(
                `Falló la configuración: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'No se pudo configurar el sistema Join to Create.'
            );
        }
    }
};
