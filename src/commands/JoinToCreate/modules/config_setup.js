import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    EmbedBuilder
} from 'discord.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../utils/errors.js';
import { updateJoinToCreateConfig, deleteJoinToCreateConfig } from '../database/jtc.js';

/**
 * Muestra y maneja el panel de configuración del sistema Join to Create (JTC)
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 * @param {import('discord.js').VoiceChannel} triggerChannel 
 * @param {Object} currentConfig 
 */
export async function handleJTCConfig(interaction, triggerChannel, currentConfig) {
    try {
        // 1. Construir el menú desplegable principal
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jtc_config_menu_${interaction.id}`)
            .setPlaceholder('Selecciona una opción para configurar...')
            .addOptions([
                {
                    label: 'Plantilla de Nombre',
                    description: 'Cambia el formato del nombre de los canales creados',
                    value: 'name_template',
                    emoji: '✏️'
                },
                {
                    label: 'Límite de Usuarios',
                    description: 'Ajusta el máximo de usuarios permitidos por canal (0-99)',
                    value: 'user_limit',
                    emoji: '👥'
                },
                {
                    label: 'Bitrate',
                    description: 'Ajusta la calidad de audio del canal (8-384 kbps)',
                    value: 'bitrate',
                    emoji: '🔊'
                },
                {
                    label: 'Eliminar Activador',
                    description: 'Elimina la configuración y el canal creador JTC',
                    value: 'delete_trigger',
                    emoji: '🗑️'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Configuración: Join to Create')
            .setDescription(`Ajustando el canal activador: **${triggerChannel.name}** (\`${triggerChannel.id}\`)`)
            .addFields(
                { name: 'Plantilla de Nombre', value: `\`${currentConfig.nameTemplate || '{username}\'s Channel'}\``, inline: true },
                { name: 'Límite de Usuarios', value: `\`${currentConfig.userLimit ?? 'Sin límite (0)'}\``, inline: true },
                { name: 'Bitrate', value: `\`${(currentConfig.bitrate || 64000) / 1000} kbps\``, inline: true }
            )
            .setColor(0x5865F2)
            .setFooter({ text: 'El menú se desactivará tras 5 minutos de inactividad.' });

        const message = await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true,
            fetchReply: true
        });

        // 2. Colector para las interacciones del menú desplegable
        const menuCollector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300_000
        });

        menuCollector.on('collect', async (selectInteraction) => {
            if (selectInteraction.user.id !== interaction.user.id) {
                await selectInteraction.reply({
                    content: '❌ No tienes permiso para interactuar con este panel.',
                    ephemeral: true
                });
                return;
            }

            const selectedValue = selectInteraction.values[0];

            switch (selectedValue) {
                case 'name_template':
                    await handleNameTemplateModal(selectInteraction, triggerChannel, currentConfig, embed, message);
                    break;

                case 'user_limit':
                    await handleUserLimitModal(selectInteraction, triggerChannel, currentConfig, embed, message);
                    break;

                case 'bitrate':
                    await handleBitrateModal(selectInteraction, triggerChannel, currentConfig, embed, message);
                    break;

                case 'delete_trigger':
                    await handleDeleteTrigger(selectInteraction, triggerChannel, message, menuCollector);
                    break;

                default:
                    await selectInteraction.deferUpdate();
                    break;
            }
        });

        menuCollector.on('end', async (_, reason) => {
            if (reason !== 'deleted') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    StringSelectMenuBuilder.from(selectMenu).setDisabled(true)
                );
                await interaction.editReply({ components: [disabledRow] }).catch(() => {});
            }
        });

    } catch (error) {
        throw new TitanBotError('Error al iniciar el panel de configuración JTC', ErrorTypes.COMMAND_EXECUTION, error);
    }
}

// ==========================================
// MANEJADORES INDIVIDUALES USANDO MODALS
// ==========================================

/**
 * Modal para la plantilla de nombre del canal
 */
async function handleNameTemplateModal(selectInteraction, triggerChannel, currentConfig, embed, mainMessage) {
    const modal = new ModalBuilder()
        .setCustomId(`jtc_modal_name_${selectInteraction.id}`)
        .setTitle('Cambiar Plantilla de Nombre');

    const nameInput = new TextInputBuilder()
        .setCustomId('input_name_template')
        .setLabel('Plantilla ({username}, {guild_name})')
        .setStyle(TextInputStyle.Short)
        .setValue(currentConfig.nameTemplate || '{username}\'s Channel')
        .setPlaceholder('Ejemplo: Canal de {username}')
        .setRequired(true)
        .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    // IMPORTANTE: Se muestra el modal sin hacer deferUpdate previas
    await selectInteraction.showModal(modal);

    const modalSubmit = await selectInteraction.awaitModalSubmit({
        filter: (i) => i.customId === `jtc_modal_name_${selectInteraction.id}` && i.user.id === selectInteraction.user.id,
        time: 120_000
    }).catch(() => null);

    if (!modalSubmit) return;

    await modalSubmit.deferUpdate();
    const newTemplate = modalSubmit.fields.getTextInputValue('input_name_template').trim();

    // Actualización en BD y objeto local
    currentConfig.nameTemplate = newTemplate;
    await updateJoinToCreateConfig(triggerChannel.guild.id, triggerChannel.id, { nameTemplate: newTemplate });

    // Actualizar Embed principal
    embed.setFields(
        { name: 'Plantilla de Nombre', value: `\`${currentConfig.nameTemplate}\``, inline: true },
        { name: 'Límite de Usuarios', value: `\`${currentConfig.userLimit ?? 'Sin límite (0)'}\``, inline: true },
        { name: 'Bitrate', value: `\`${(currentConfig.bitrate || 64000) / 1000} kbps\``, inline: true }
    );

    await mainMessage.edit({ embeds: [embed] });
    await modalSubmit.followUp({ content: `✅ Plantilla de nombre actualizada a: \`${newTemplate}\``, ephemeral: true });
}

/**
 * Modal para el límite de usuarios
 */
async function handleUserLimitModal(selectInteraction, triggerChannel, currentConfig, embed, mainMessage) {
    const modal = new ModalBuilder()
        .setCustomId(`jtc_modal_limit_${selectInteraction.id}`)
        .setTitle('Cambiar Límite de Usuarios');

    const limitInput = new TextInputBuilder()
        .setCustomId('input_user_limit')
        .setLabel('Límite de usuarios (0 - 99)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(currentConfig.userLimit ?? 0))
        .setPlaceholder('0 = Sin límite')
        .setRequired(true)
        .setMaxLength(2);

    modal.addComponents(new ActionRowBuilder().addComponents(limitInput));

    await selectInteraction.showModal(modal);

    const modalSubmit = await selectInteraction.awaitModalSubmit({
        filter: (i) => i.customId === `jtc_modal_limit_${selectInteraction.id}` && i.user.id === selectInteraction.user.id,
        time: 120_000
    }).catch(() => null);

    if (!modalSubmit) return;

    const rawLimit = modalSubmit.fields.getTextInputValue('input_user_limit').trim();
    const newLimit = parseInt(rawLimit, 10);

    // Validación numérica limpia con mensaje nativo del modal
    if (isNaN(newLimit) || newLimit < 0 || newLimit > 99) {
        await modalSubmit.reply({
            content: '❌ Debes ingresar un número entero válido entre **0** y **99**.',
            ephemeral: true
        });
        return;
    }

    await modalSubmit.deferUpdate();

    currentConfig.userLimit = newLimit;
    await updateJoinToCreateConfig(triggerChannel.guild.id, triggerChannel.id, { userLimit: newLimit });

    embed.setFields(
        { name: 'Plantilla de Nombre', value: `\`${currentConfig.nameTemplate || '{username}\'s Channel'}\``, inline: true },
        { name: 'Límite de Usuarios', value: `\`${currentConfig.userLimit === 0 ? 'Sin límite (0)' : currentConfig.userLimit}\``, inline: true },
        { name: 'Bitrate', value: `\`${(currentConfig.bitrate || 64000) / 1000} kbps\``, inline: true }
    );

    await mainMessage.edit({ embeds: [embed] });
    await modalSubmit.followUp({ content: `✅ Límite de usuarios actualizado a: **${newLimit === 0 ? 'Sin límite' : newLimit}**`, ephemeral: true });
}

/**
 * Modal para la tasa de bits (Bitrate)
 */
async function handleBitrateModal(selectInteraction, triggerChannel, currentConfig, embed, mainMessage) {
    const guildMaxBitrate = selectInteraction.guild.maximumBitrate / 1000; // En kbps (80, 96, 128, 256, 384 según Boost Level)

    const modal = new ModalBuilder()
        .setCustomId(`jtc_modal_bitrate_${selectInteraction.id}`)
        .setTitle('Ajustar Bitrate');

    const bitrateInput = new TextInputBuilder()
        .setCustomId('input_bitrate')
        .setLabel(`Bitrate en kbps (8 - ${guildMaxBitrate})`)
        .setStyle(TextInputStyle.Short)
        .setValue(String((currentConfig.bitrate || 64000) / 1000))
        .setPlaceholder(`Ejemplo: 64`)
        .setRequired(true)
        .setMaxLength(3);

    modal.addComponents(new ActionRowBuilder().addComponents(bitrateInput));

    await selectInteraction.showModal(modal);

    const modalSubmit = await selectInteraction.awaitModalSubmit({
        filter: (i) => i.customId === `jtc_modal_bitrate_${selectInteraction.id}` && i.user.id === selectInteraction.user.id,
        time: 120_000
    }).catch(() => null);

    if (!modalSubmit) return;

    const rawBitrate = modalSubmit.fields.getTextInputValue('input_bitrate').trim();
    const kbps = parseInt(rawBitrate, 10);

    if (isNaN(kbps) || kbps < 8 || kbps > guildMaxBitrate) {
        await modalSubmit.reply({
            content: `❌ Por favor ingresa un valor numérico válido entre **8** y **${guildMaxBitrate}** kbps para este servidor.`,
            ephemeral: true
        });
        return;
    }

    await modalSubmit.deferUpdate();

    const bps = kbps * 1000;
    currentConfig.bitrate = bps;
    await updateJoinToCreateConfig(triggerChannel.guild.id, triggerChannel.id, { bitrate: bps });

    embed.setFields(
        { name: 'Plantilla de Nombre', value: `\`${currentConfig.nameTemplate || '{username}\'s Channel'}\``, inline: true },
        { name: 'Límite de Usuarios', value: `\`${currentConfig.userLimit ?? 'Sin límite (0)'}\``, inline: true },
        { name: 'Bitrate', value: `\`${kbps} kbps\``, inline: true }
    );

    await mainMessage.edit({ embeds: [embed] });
    await modalSubmit.followUp({ content: `✅ Bitrate actualizado a: **${kbps} kbps**`, ephemeral: true });
}

/**
 * Confirmación vía botones para la eliminación del activador JTC
 */
async function handleDeleteTrigger(selectInteraction, triggerChannel, mainMessage, menuCollector) {
    await selectInteraction.deferUpdate();

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_del_${selectInteraction.id}`)
            .setLabel('Sí, eliminar activador')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_del_${selectInteraction.id}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
    );

    const confirmMsg = await selectInteraction.followUp({
        content: '⚠️ **¿Estás seguro de que deseas eliminar este canal activador JTC?** Esta acción borrará la configuración y el canal.',
        components: [confirmRow],
        ephemeral: true,
        fetchReply: true
    });

    const btnInteraction = await confirmMsg.awaitMessageComponent({
        filter: (i) => i.user.id === selectInteraction.user.id,
        time: 30_000,
        componentType: ComponentType.Button
    }).catch(() => null);

    if (!btnInteraction) {
        await selectInteraction.editReply({ content: '⏳ Tiempo de espera agotado. Eliminación cancelada.', components: [] }).catch(() => {});
        return;
    }

    if (btnInteraction.customId === `confirm_del_${selectInteraction.id}`) {
        await btnInteraction.deferUpdate();
        
        // 1. Eliminar de la base de datos
        await deleteJoinToCreateConfig(triggerChannel.guild.id, triggerChannel.id);
        
        // 2. Detener el colector del menú principal
        menuCollector.stop('deleted');

        // 3. Notificar y eliminar el canal de voz en Discord
        await btnInteraction.editReply({
            content: '✅ El activador Join to Create y su configuración han sido eliminados correctamente.',
            components: []
        });

        await mainMessage.edit({ content: '🔒 Este panel ha sido desactivado porque el canal fue eliminado.', embeds: [], components: [] }).catch(() => {});
        await triggerChannel.delete('Eliminación de canal activador JTC').catch(() => {});

    } else {
        await btnInteraction.update({
            content: '❌ Eliminación cancelada. El canal permanece activo.',
            components: []
        });
    }
}
