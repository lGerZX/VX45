import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger
} from '../../../utils/database.js';

/**
 * Obtiene las opciones efectivas de un canal específico respaldándose en la configuración global
 */
function getEffectiveOptions(currentConfig, channelId) {
    const channelOpts = currentConfig.channelOptions?.[channelId] || {};
    return {
        nameTemplate: channelOpts.nameTemplate ?? currentConfig.channelNameTemplate,
        userLimit: channelOpts.userLimit ?? currentConfig.userLimit ?? 0,
        bitrate: channelOpts.bitrate ?? currentConfig.bitrate ?? 64000
    };
}

/**
 * Formatea el límite de usuarios para mostrar en los embeds
 */
function formatUserLimit(limit) {
    return limit === 0 ? 'Sin límite' : `${limit} usuarios`;
}

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
            const guildId = interaction.guild.id;

            const currentConfig = await getJoinToCreateConfig(client, guildId);

            if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                throw new TitanBotError(
                    `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                    ErrorTypes.VALIDATION,
                    `${triggerChannel} no está configurado como un canal activador de Join to Create.`
                );
            }

            const effective = getEffectiveOptions(currentConfig, triggerChannel.id);

            const embed = new EmbedBuilder()
                .setTitle('Configuración de Join to Create')
                .setDescription(`Configurar ajustes para ${triggerChannel}`)
                .setColor(getColor('info'))
                .addFields(
                    {
                        name: 'Plantilla de nombre actual',
                        value: `\`${effective.nameTemplate}\``,
                        inline: false
                    },
                    {
                        name: 'Límite de usuarios actual',
                        value: formatUserLimit(effective.userLimit),
                        inline: true
                    },
                    {
                        name: 'Bitrate actual',
                        value: `${effective.bitrate / 1000} kbps`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Selecciona una opción de configuración a continuación' })
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`jointocreate_config_${triggerChannel.id}`)
                .setPlaceholder('Selecciona una opción de configuración')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cambiar plantilla de nombre')
                        .setDescription('Modifica el formato para el nombre de los canales temporales')
                        .setValue('name_template'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cambiar límite de usuarios')
                        .setDescription('Define el límite máximo de usuarios por canal')
                        .setValue('user_limit'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cambiar bitrate')
                        .setDescription('Ajusta la calidad de audio para los canales temporales')
                        .setValue('bitrate'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Eliminar este canal activador')
                        .setDescription('Remueve este canal del sistema Join to Create')
                        .setValue('remove_trigger'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Ver configuración actual')
                        .setDescription('Muestra todos los detalles de la configuración actual')
                        .setValue('view_settings')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            }).catch(error => {
                logger.error('Error al editar la respuesta en config_setup:', error);
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
                time: 60000
            });

            collector.on('collect', async (selectInteraction) => {
                await selectInteraction.deferUpdate();

                const selectedOption = selectInteraction.values[0];

                try {
                    switch (selectedOption) {
                        case 'name_template':
                            await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'user_limit':
                            await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'bitrate':
                            await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'remove_trigger':
                            await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'view_settings':
                            await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Error de validación de configuración: ${error.message}`, error.context || {});
                    } else {
                        logger.error('Error no esperado en el menú de configuración:', error);
                    }

                    const errorMessage = error instanceof TitanBotError 
                        ? error.userMessage || 'Ocurrió un error al procesar tu selección.'
                        : 'Ocurrió un error al procesar tu selección.';

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        selectMenu.setDisabled(true)
                    );

                    await InteractionHelper.safeEditReply(interaction, {
                        components: [disabledRow],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error no esperado en config_setup:', error);
            throw new TitanBotError(
                `Falló el ajuste de configuración: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'No se pudo configurar el sistema Join to Create.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const effective = getEffectiveOptions(currentConfig, triggerChannel.id);

    const embed = new EmbedBuilder()
        .setTitle('Configuración de la Plantilla de Nombre')
        .setDescription('Por favor escribe la nueva plantilla de nombre en el chat.')
        .addFields(
            {
                name: 'Variables disponibles',
                value: '• `{username}` - Nombre de usuario\n• `{display_name}` - Nombre mostrado\n• `{user_tag}` - Tag del usuario\n• `{guild_name}` - Nombre del servidor',
                inline: false
            },
            {
                name: 'Plantilla actual',
                value: `\`${effective.nameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Escribe tu nueva plantilla en el chat abajo' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();

            if (!newTemplate || newTemplate.length > 100) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'La plantilla debe contener entre 1 y 100 caracteres.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Plantilla Actualizada', `La plantilla del nombre del canal cambió a \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación en la plantilla: ${error.message}`);
            } else {
                logger.error('Error actualizando la plantilla:', error);
            }

            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'No se pudo actualizar la plantilla de nombre.'
                : 'No se pudo actualizar la plantilla de nombre.';

            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se recibió respuesta. Actualización de plantilla cancelada.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const effective = getEffectiveOptions(currentConfig, triggerChannel.id);

    const embed = new EmbedBuilder()
        .setTitle('Configuración del Límite de Usuarios')
        .setDescription('Ingresa el nuevo límite de usuarios (0-99, donde 0 = sin límite).')
        .addFields({
            name: 'Límite actual',
            value: formatUserLimit(effective.userLimit),
            inline: false
        })
        .setColor(getColor('info'))
        .setFooter({ text: 'Escribe el nuevo límite en el chat abajo' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const rawContent = message.content.trim();
            if (!/^\d+$/.test(rawContent)) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Por favor ingresa un número entero válido entre 0 y 99.'
                });
                return;
            }

            const newLimit = parseInt(rawContent, 10);

            if (newLimit < 0 || newLimit > 99) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'El límite de usuarios debe estar entre 0 y 99.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Límite Actualizado', `El límite de usuarios cambió a ${formatUserLimit(newLimit)}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación en límite de usuarios: ${error.message}`);
            } else {
                logger.error('Error actualizando límite de usuarios:', error);
            }

            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'No se pudo actualizar el límite de usuarios.'
                : 'No se pudo actualizar el límite de usuarios.';

            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se recibió una respuesta válida. Actualización cancelada.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const effective = getEffectiveOptions(currentConfig, triggerChannel.id);

    const embed = new EmbedBuilder()
        .setTitle('Configuración de Bitrate')
        .setDescription('Ingresa el nuevo bitrate en kbps (8-384).')
        .addFields(
            {
                name: 'Bitrate actual',
                value: `${effective.bitrate / 1000} kbps`,
                inline: false
            },
            {
                name: 'Valores comunes',
                value: '• 64 kbps - Calidad normal\n• 96 kbps - Buena calidad\n• 128 kbps - Calidad alta\n• 256 kbps - Calidad muy alta',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Escribe el nuevo bitrate en el chat abajo' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const rawContent = message.content.trim();
            if (!/^\d+$/.test(rawContent)) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Por favor ingresa un número de bitrate válido.'
                });
                return;
            }

            const newBitrate = parseInt(rawContent, 10);

            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'El bitrate debe estar entre 8 y 384 kbps.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Bitrate Actualizado', `El bitrate cambió a ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Error de validación de bitrate: ${error.message}`);
            } else {
                logger.error('Error al actualizar el bitrate:', error);
            }

            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'No se pudo actualizar el bitrate.'
                : 'No se pudo actualizar el bitrate.';

            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se recibió una respuesta válida. Actualización cancelada.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Eliminar Canal Activador')
        .setDescription(`¿Estás seguro de que deseas eliminar ${triggerChannel} del sistema Join to Create?`)
        .setColor('#ff6600')
        .setFooter({ text: 'Esta acción no se puede deshacer' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Eliminar Canal')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);

                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('Canal Eliminado', `${triggerChannel} ha sido eliminado del sistema Join to Create.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserError(buttonInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'No se pudo eliminar el canal activador.'
                    });
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Error de validación al eliminar activador: ${error.message}`);
                } else {
                    logger.error('Error al eliminar canal activador:', error);
                }

                const errorMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Ocurrió un error al eliminar el canal activador.'
                    : 'Ocurrió un error al eliminar el canal activador.';

                await replyUserError(buttonInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('Cancelado', 'La eliminación del canal ha sido cancelada.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se recibió respuesta. Eliminación cancelada.'
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const effective = getEffectiveOptions(currentConfig, triggerChannel.id);

    const embed = new EmbedBuilder()
        .setTitle('Configuración Actual')
        .setDescription(`Ajustes para ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: 'Canal activador',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: 'Plantilla de nombre',
                value: `\`${effective.nameTemplate}\``,
                inline: false
            },
            {
                name: 'Límite de usuarios',
                value: formatUserLimit(effective.userLimit),
                inline: true
            },
            {
                name: 'Bitrate',
                value: `${effective.bitrate / 1000} kbps`,
                inline: true
            },
            {
                name: 'Categoría',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'No configurada',
                inline: true
            },
            {
                name: 'Estado del sistema',
                value: currentConfig.enabled ? '✅ Habilitado' : '❌ Deshabilitado',
                inline: true
            },
            {
                name: 'Canales temporales activos',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}
