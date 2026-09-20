import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
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
            // 1. Verificación de permisos del usuario
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'Necesitas el permiso de **Gestionar Servidor** para ejecutar esta configuración.'
                );
            }

            // 2. Comprobar si ya existe un canal activador funcional
            const existingConfig = await getJoinToCreateConfig(client, guildId).catch(() => null);
            if (existingConfig && Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
                const activeChannels = [];
                for (const channelId of existingConfig.triggerChannels) {
                    const ch = await interaction.guild.channels.fetch(channelId).catch(() => null);
                    if (ch) activeChannels.push(ch);
                }

                if (activeChannels.length > 0) {
                    throw new TitanBotError(
                        'Guild already has a Join to Create channel',
                        ErrorTypes.VALIDATION,
                        `Este servidor ya tiene un canal de Join to Create configurado: ${activeChannels[0]}\n\nUsa el dashboard o elimínalo antes de crear uno nuevo.`
                    );
                }
            }

            // 3. Crear el canal activador (userLimit debe ser 0 para el activador)
            const maxGuildBitrate = interaction.guild.maximumBitrate || 96000;
            const targetBitrate = Math.min(bitrate * 1000, maxGuildBitrate);

            const triggerChannel = await interaction.guild.channels.create({
                name: 'Join to Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: 0, // Siempre 0 para el canal activador
                bitrate: targetBitrate,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            // 4. Guardar la configuración de las salas temporales en la base de datos
            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            // 5. Crear el mensaje de respuesta
            const embed = successEmbed(
                '✅ Configuración de Join to Create completada',
                `Canal activador creado: ${triggerChannel}\n\n` +
                `**Ajustes para salas temporales:**\n` +
                `• Plantilla del nombre: \`${nameTemplate}\`\n` +
                `• Límite de usuarios: ${userLimit === 0 ? 'Sin límite' : userLimit + ' usuarios'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ? `• Categoría: ${category.name}` : '• Categoría: Ninguna (nivel raíz)'}\n\n` +
                `Cuando los usuarios se unan a este canal, se creará su canal de voz temporal automáticamente.`
            );

            // 6. Enviar respuesta de forma limpia y segura
            if (interaction.deferred || interaction.replied) {
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
            }

        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error en la configuración de JoinToCreate setup:', error);
            throw new TitanBotError(
                `Falló la configuración: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'No se pudo configurar el sistema Join to Create. Verifica los permisos del bot.'
            );
        }
    }
};
