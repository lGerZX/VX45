import { getColor, getDefaultApplicationPreguntas, botConfig } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RolSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRols,
    saveApplicationRols,
    getApplicationRolSettings,
    saveApplicationRolSettings,
    deleteApplicationRolSettings,
    getAplicaciones,
    deleteApplication,
} from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { setLogChannel, resolveApplicationLogChannel, resolveLogChannel } from '../../../services/loggingService.js';

async function buildDashboardEmbed(settings, roles, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;
    const logChannel = applicationsChannel ? `<#${applicationsChannel}>` : '`No configurado`';
    const managerRolList =
        settings.managerRols?.length > 0
            ? settings.managerRols.map(id => `<@&${id}>`).join(',')
            : '`Ninguno configurado`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`No hay roles de aplicación configurados`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`No configurado`';

    return new EmbedBuilder()
        .setTitle('Panel de Aplicaciones')
        .setDescription(`Administra la configuración de aplicaciones para **${guild.name}**.\nSelecciona una opción abajo para modificar una configuración.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Estado de las Aplicaciones', value: settings.enabled ? 'Activada' : 'Desactivada', inline: true },
            { name: 'Canal de Registros', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Rols de Administradores', value: managerRolList, inline: false },
            { name: 'Preguntas', value: `${questionCount} configured — first: ${firstQ}`, inline: false },
            { name: 'Rols de Aplicación', value: roleList, inline: false },
            {
                name: 'Retención',
                value: `Pendientes: **${settings.pendingApplicationRetenciónDays ?? 30} días** · Revisadas: **${settings.reviewedApplicationRetenciónDays ?? 14} días**`,
                inline: false,
            },
        )
        .setFooter({ text: 'El panel se cierra después de 15 minutos de inactividad' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Selecciona una configuración para modificar...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Canal de Registros')
                .setDescription('Establece el canal donde se registrarán las nuevas solicitudes')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Rols de Administradores')
                .setDescription('Añade o elimina un rol que pueda administrar las solicitudes')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Preguntas')
                .setDescription('Personaliza las preguntas que aparecen en el formulario de solicitud')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Añadir Rol de Aplicación')
                .setDescription('Añade un rol al que los miembros puedan solicitar acceso')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Eliminar Rol de Aplicación')
                .setDescription('Elimina un rol de la lista de solicitudes')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retención Period')
                .setDescription('Establece cuánto tiempo se conservan las solicitudes pendientes y revisadas')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Aplicaciones')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDesactivada(disabled),
    );
}

async function refreshDashboard(rootInteraction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(settings, roles, rootInteraction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRols(client, guildId),
            ]);

            const guildConfig = await getGuildConfig(client, guildId);
            const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;

            const isCompletelyUnconfigured = 
                !applicationsChannel && 
                !settings.enabled && 
                (settings.managerRols?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    'Sistema de aplicaciones no configurado',
                    ErrorTypes.CONFIGURATION,
                    'El sistema de aplicaciones todavía no está configurado. Ejecuta `/app-admin setup` para crear tu primera aplicación.',
                );
            }

            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            if (selectedAppName) {
                const selectedRol = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRol) {
                    await showApplicationDashboard(interaction, selectedRol, settings, roles, guildId, client);
                    return;
                }
                
            }

            const defaultRol = roles[0];
            await showApplicationDashboard(interaction, defaultRol, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new TitanBotError(
                `Aplicaciones dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'No se pudo abrir el panel de aplicaciones.',
            );
        }
    },
};

async function showApplicationSelector(interaction, roles, settings, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Selecciona una aplicación para configurar...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`Configura la aplicación de ${role.name}`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('Seleccionar Aplicación')
        .setDescription('Elige qué rol de aplicación quieres configurar.')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRolId = selectInteraction.values[0];
        const selectedRol = roles.find(r => r.roleId === selectedRolId);

        if (selectedRol) {
            await showApplicationDashboard(interaction, selectedRol, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se realizó ninguna selección. El panel se ha cerrado.',
            }).catch(() => {});
        }
    });
}

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [await buildDashboardEmbed(settings, roles, interaction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

async function showApplicationDashboard(rootInteraction, selectedRol, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRol.roleId);

    const guildConfig = await getGuildConfig(client, guildId);
    const appSettings = await getApplicationRolSettings(client, guildId, selectedRol.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = resolveApplicationLogChannel(guildConfig, appSettings, settings);
    const isActivada = selectedRol.enabled !== false; 

    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`Hereda el canal de registros global`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Hereda las preguntas globales`';
    
    const managerRolsDisplay = settings.managerRols && settings.managerRols.length > 0
        ? settings.managerRols.map(id => `<@&${id}>`).join(',')
        : '`Ninguno configurado`';

    const embed = new EmbedBuilder()
        .setTitle('📋 Panel de Aplicación')
        .setDescription(`Configuración de **${selectedRol.name}**`)
        .setColor(isActivada ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: 'Rol', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRol.roleId}>`, 
                inline: true 
            },
            { 
                name: 'Estado de las Aplicaciones', 
                value: isActivada ? '✅ **Activada**' : '❌ **Desactivada**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: 'Preguntas', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: 'Canal de Registros', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: 'Rols de Administradores',
                value: managerRolsDisplay,
                inline: true 
            },
            { 
                name: 'Retención Period',
                value: `Pendientes: **${settings.pendingApplicationRetenciónDays ?? 30} días** · Revisadas: **${settings.reviewedApplicationRetenciónDays ?? 14} días**`,
                inline: false 
            },
        )
        .setFooter({ text: 'El panel se cierra después de 10 minutos de inactividad' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRol.roleId);

    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRol.roleId}`)
            .setLabel(isActivada ? 'Desactivar Aplicación' : 'Activar Aplicación')
            .setStyle(isActivada ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRol.roleId}`)
            .setLabel('Eliminar Aplicación')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRol.roleId);
}

function setupCollectors(interaction, settings, roles, guildId, client, selectedRolId) {
    const customIdPrefix = selectedRolId ? `app_cfg_${selectedRolId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRolId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRolId);
                    break;
                case 'manager_role':
                    await handleManagerRol(selectInteraction, interaction, settings, roles, guildId, client, selectedRolId);
                    break;
                case 'questions':
                    await handlePreguntas(selectInteraction, interaction, settings, roles, guildId, client, selectedRolId);
                    break;
                case 'role_add':
                    await handleRolAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRolRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetención(selectInteraction, interaction, settings, roles, guildId, client, selectedRolId);
                    break;
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Aplicaciones config validation error: ${error.message}`);
            } else {
                logger.error('Unexpected applications dashboard error:', error);
            }

            const errorMessage =
                error instanceof TitanBotError
                    ? error.userMessage || 'Ocurrió un error al procesar tu selección.'
                    : 'Ocurrió un error inesperado al actualizar la configuración.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await replyUserError(selectInteraction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage,
            }).catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 ⏰ Panel Expirado')
                .setDescription('Este panel se ha cerrado por inactividad. Ejecuta el comando nuevamente para continuar.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    if (!selectedRolId) {
        const globalToggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasActivada = settings.enabled === true;
                settings.enabled = !wasActivada;

                await saveApplicationSettings(interaction.client, guildId, settings);

                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRols = await getApplicationRols(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRols, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasActivada ? '🔴 🔴 Aplicaciones Desactivadas' : '🟢 🟢 Aplicaciones Activadas',
                        `El sistema de aplicaciones ahora está **${wasActivada ? 'desactivado' : 'activado'}**.\n\n${
                            wasActivada 
                                ? 'Los miembros ya no podrán solicitar roles.' 
                                : 'Los miembros ya pueden comenzar a solicitar roles.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling global application status:', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Ocurrió un error al cambiar el estado de la aplicación.',
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Tiempo de Configuración Agotado')
                    .setDescription('Esta sesión del panel ha expirado por inactividad (10 minutos).\n\nPara continuar configurando tus aplicaciones, ejecuta el comando nuevamente.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    if (selectedRolId) {
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRolId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            
            const appRolForDelete = roles.find(r => r.roleId === selectedRolId);
            const appNameForDelete = appRolForDelete?.name ?? 'this application';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('Confirmar Eliminación de Aplicación');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ Estás a punto de eliminar permanentemente **${appNameForDelete}**. Todas las solicitudes y configuraciones almacenadas para este rol serán eliminadas y no podrán recuperarse.`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('Confirmo — esta acción no se puede deshacer')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('Error showing delete confirmation modal:', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Failed to show confirmation modal. Please try again.',
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await replyUserError(btnInteraction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'La eliminación de la aplicación fue cancelada.',
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await replyUserError(confirmSubmit, { type: ErrorTypes.VALIDATION, message: 'Debes marcar la casilla de confirmación para eliminar la aplicación.' });
                    return;
                }

                await handleDeleteApplication(confirmSubmit, selectedRolId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('Error confirming application deletion:', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Ocurrió un error al eliminar la aplicación.',
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Tiempo de Configuración Agotado')
                    .setDescription('Esta sesión del panel ha expirado por inactividad (10 minutos).\n\nPara continuar configurando tus aplicaciones, ejecuta el comando nuevamente.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        const toggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRolId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                
                const roleIndex = roles.findIndex(r => r.roleId === selectedRolId);
                if (roleIndex === -1) {
                    await replyUserError(toggleInteraction, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'No se encontró el rol de aplicación.',
                    });
                    return;
                }

                const wasActivada = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasActivada;

                await saveApplicationRols(interaction.client, guildId, roles);

                const updatedRol = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRol, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasActivada ? '🔴 🔴 Aplicación Desactivada' : '🟢 🟢 Aplicación Activada',
                        `La aplicación de **${updatedRol.name}** ahora está **${wasActivada ? 'desactivada' : 'activada'}**.\n\n${
                            wasActivada 
                                ? 'Esta aplicación ya no aparecerá en las opciones de `/apply submit`.' 
                                : 'Esta aplicación ahora aparecerá en las opciones de `/apply submit`.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling application status:', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Ocurrió un error al cambiar el estado de la aplicación.',
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Tiempo de Configuración Agotado')
                    .setDescription('Esta sesión del panel ha expirado por inactividad (10 minutos).\n\nPara continuar configurando tus aplicaciones, ejecuta el comando nuevamente.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

function buildApplicationSelectMenu(guildId, roleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('Selecciona una configuración para modificar...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Canal de Registros')
                .setDescription('Set the channel where applications are logged')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Rols de Administradores')
                .setDescription('Añade o elimina un rol que pueda administrar las solicitudes')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Preguntas')
                .setDescription('Personaliza las preguntas que aparecen en el formulario de solicitud')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retención Period')
                .setDescription('Establece cuánto tiempo se conservan las solicitudes pendientes y revisadas')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

async function handleLogChannel(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRolId) {
    let currentChannel = settings.logChannelId;
    if (selectedRolId) {
        const roleSettings = await getApplicationRolSettings(client, guildId, selectedRolId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_channel_modal_${guildId}_${selectedRolId || 'global'}`)
        .setTitle('Configurar Canal de Registros');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('log_channel')
        .setPlaceholder('Selecciona un canal de texto...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Canal de Registros')
        .setDescription('Canal donde se registrarán las nuevas solicitudes')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_channel_modal_${guildId}_${selectedRolId || 'global'}`,
        });

        const channelId = modalSubmission.fields.getField('log_channel').values[0];
        const channel = selectInteraction.guild.channels.cache.get(channelId);

        if (selectedRolId) {
            const roleSettings = await getApplicationRolSettings(client, guildId, selectedRolId);
            roleSettings.logChannelId = channelId;
            await saveApplicationRolSettings(client, guildId, selectedRolId, roleSettings);
        } else {
            await setLogChannel(client, guildId, 'applications', channelId);
            settings.logChannelId = channelId;
            await saveApplicationSettings(client, guildId, settings);
        }

        await modalSubmission.reply({
            embeds: [successEmbed('Canal de Registros Actualizado', `Application logs will now be sent to ${channel ?? `<#${channelId}>`}.\nYou can also manage this from \`/logging dashboard\`.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in log channel modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Ocurrió un error al actualizar el canal de registros.',
        });
    }
}

async function handleManagerRol(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_role_modal_${guildId}`)
        .setTitle('Configurar Rols de Administradores');

    const roleSelect = new RolSelectMenuBuilder()
        .setCustomId('manager_roles')
        .setPlaceholder('Selecciona los roles que tendrán acceso de administrador...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Rols de Administradores')
        .setDescription('Los roles seleccionados se activarán o desactivarán como roles de administrador')
        .setRolSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_role_modal_${guildId}`,
        });

        const selectedRolIds = modalSubmission.fields.getField('manager_roles').values;
        const roleSet = new Set(settings.managerRols ?? []);

        for (const roleId of selectedRolIds) {
            if (roleSet.has(roleId)) {
                roleSet.delete(roleId);
            } else {
                roleSet.add(roleId);
            }
        }

        settings.managerRols = Array.from(roleSet);
        await saveApplicationSettings(client, guildId, settings);

        const finalList = settings.managerRols.length > 0
            ? settings.managerRols.map(id => `<@&${id}>`).join(',')
            : '`Ninguno`';

        await modalSubmission.reply({
            embeds: [successEmbed('Rols de Administradores Actualizados', `Rols de administrador actuales: ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in manager role modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Ocurrió un error al actualizar los roles de administradores.',
        });
    }
}

async function handlePreguntas(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRolId) {
    let currentPreguntas = settings.questions ?? [];
    
    if (selectedRolId) {
        const roleSettings = await getApplicationRolSettings(client, guildId, selectedRolId);
        currentPreguntas = roleSettings.questions ?? currentPreguntas;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('Editar Preguntas de la Aplicación')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('Pregunta 1 (obligatoria)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentPreguntas[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Pregunta 2 (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentPreguntas[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Pregunta 3 (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentPreguntas[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Pregunta 4 (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentPreguntas[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Pregunta 5 (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentPreguntas[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newPreguntas = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newPreguntas.length === 0) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'Se requiere al menos una pregunta.' });
        return;
    }

    if (selectedRolId) {
        
        const roleSettings = await getApplicationRolSettings(client, guildId, selectedRolId);
        roleSettings.questions = newPreguntas;
        await saveApplicationRolSettings(client, guildId, selectedRolId, roleSettings);
    } else {
        
        settings.questions = newPreguntas;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Preguntas Actualizadas',
                `${newPreguntas.length} pregunta${newPreguntas.length !== 1 ? 's' : ''} guardada${newPreguntas.length !== 1 ? 's' : ''}.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleRolAdd(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_add_modal_${guildId}`)
        .setTitle('Añadir Rol de Aplicación');

    const roleSelect = new RolSelectMenuBuilder()
        .setCustomId('application_role')
        .setPlaceholder('Selecciona el rol al que los miembros podrán solicitar acceso...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Application Rol')
        .setDescription('Selecciona el rol de Discord al que los miembros podrán solicitar acceso')
        .setRolSelectMenuComponent(roleSelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('Nombre mostrado (déjalo vacío para usar el nombre del rol)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_add_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('application_role').values[0];
        const role = selectInteraction.guild.roles.cache.get(roleId);
        const customName = modalSubmission.fields.getTextInputValue('role_name').trim() || role?.name || roleId;

        if (roles.some(r => r.roleId === roleId)) {
            await replyUserError(modalSubmission, { type: ErrorTypes.UNKNOWN, message: `${role ?? roleId} ya es un rol de aplicación.` });
            return;
        }

        roles.push({ roleId, name: customName });
        await saveApplicationRols(client, guildId, roles);
        await saveApplicationRolSettings(client, guildId, roleId, {
            questions: getDefaultApplicationPreguntas(),
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Rol Añadido', `${role ?? roleId} añadido como **${customName}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role add modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Ocurrió un error al añadir el rol de aplicación.',
        });
    }
}

async function handleRolRemove(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    if (roles.length === 0) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'No hay roles de aplicación configurados para eliminar.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_remove_modal_${guildId}`)
        .setTitle('Eliminar Rol de Aplicación');

    const roleSelect = new RolSelectMenuBuilder()
        .setCustomId('remove_role')
        .setPlaceholder('Selecciona el rol que quieres eliminar...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Eliminar Rol de Aplicación')
        .setDescription('Selecciona el rol que quieres eliminar de la lista de solicitudes')
        .setRolSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_remove_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('remove_role').values[0];
        const index = roles.findIndex(r => r.roleId === roleId);

        if (index === -1) {
            await replyUserError(modalSubmission, { type: ErrorTypes.USER_INPUT, message: `<@&${roleId}> no está en la lista de roles de aplicación.` });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRols(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('Rol Eliminado', `<@&${roleId}> ha sido eliminado de los roles de aplicación.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role remove modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Ocurrió un error al eliminar el rol de aplicación.',
        });
    }
}

async function handleRetención(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Periodos de Retención de Solicitudes');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**Pending** — how long unanswered/in-progress applications are kept before being automatically removed.\n' +
            '**Reviewed** — how long approved or denied applications are kept.\n' +
            '-# Enter a whole number between 1 and 3650 (max 10 years).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Retención de pendientes (días)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetenciónDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('Retención de revisadas (días)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetenciónDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'La retención de pendientes debe ser un número entero entre **1** y **3650** días.' });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'La retención de revisadas debe ser un número entero entre **1** y **3650** días.' });
        return;
    }

    settings.pendingApplicationRetenciónDays = pendingDays;
    settings.reviewedApplicationRetenciónDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Retención Actualizada',
                `Las solicitudes pendientes se conservarán durante **${pendingDays} días**.\nLas solicitudes revisadas se conservarán durante **${reviewedDays} días**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleDeleteApplication(confirmSubmit, selectedRolId, guildId, roles, client) {
    try {
        
        const roleIndex = roles.findIndex(r => r.roleId === selectedRolId);
        if (roleIndex === -1) {
            await replyUserError(confirmSubmit, { type: ErrorTypes.USER_INPUT, message: 'No se encontró el rol de aplicación.' });
            return;
        }

        const deletedRol = roles[roleIndex];

        roles.splice(roleIndex, 1);

        await saveApplicationRols(client, guildId, roles);

        await deleteApplicationRolSettings(client, guildId, selectedRolId);

        const allAplicaciones = await getAplicaciones(client, guildId);
        const applicationsToDelete = allAplicaciones.filter(app => app.roleId === selectedRolId);

        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ Aplicación Eliminada',
                    `La aplicación para <@&${selectedRolId}> (**${deletedRol.name}**) ha sido eliminada permanentemente.\n\n` +
                    `Eliminadas: **${applicationsToDelete.length}** solicitud${applicationsToDelete.length !== 1 ? 'es' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('Error in handleDeleteApplication:', error);
        await replyUserError(confirmSubmit, { type: ErrorTypes.UNKNOWN, message: 'Ocurrió un error al eliminar la aplicación. Please try again.' });
    }
}
