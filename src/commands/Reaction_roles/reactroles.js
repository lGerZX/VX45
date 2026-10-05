import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { createError, TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, hasDangerousPermissions, getAllReactionRoleMessages, deleteReactionRoleMessage } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import {
    getReactionRolePanelStatus,
    formatPanelStatusField,
} from '../../utils/panelStatus.js';
import { startDashboardSession } from '../../utils/dashboardSession.js';
import { getReactionRoleKey } from '../../utils/database/keys.js';

const DASHBOARD_EPHEMERAL = MessageFlags.Ephemeral;
const SELECT_OPTION_LABEL_LIMIT = 100;
const SELECT_OPTION_DESCRIPTION_LIMIT = 100;

function truncateText(value, maxLength) {
    const text = String(value ?? '');
    return text.length > maxLength ? text.substring(0, maxLength) : text;
}

export default {
    data: new SlashCommandBuilder()
        .setName('reactroles')
        .setDescription('Gestiona las asignaciones de roles de reacción')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configura un nuevo panel de roles de reacción')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('El canal donde se enviará el mensaje del panel de roles de reacción')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Título del panel de roles de reacción')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Descripción del panel de roles de reacción')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role1')
                        .setDescription('Primer rol a añadir')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role2')
                        .setDescription('Segundo rol a añadir')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role3')
                        .setDescription('Tercer rol a añadir')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role4')
                        .setDescription('Cuarto rol a añadir')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role5')
                        .setDescription('Quinto rol a añadir')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Gestiona y configura tus paneles de roles de reacción')
                .addStringOption(option =>
                    option
                        .setName('panel')
                        .setDescription('Selecciona un panel de roles de reacción para gestionar')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            await handleSetup(interaction);
        } else if (subcommand === 'dashboard') {
            const selectedPanelId = interaction.options.getString('panel');
            await handleDashboard(interaction, selectedPanelId);
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'reactroles') return;
        if (interaction.options.getSubcommand() !== 'dashboard') return;

        // Autocomplete must respond within 3s. Build choices from stored panel data and
        // cached channels/messages only — no network fetches — to avoid DiscordAPIError 10062.
        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            const guild = interaction.guild;

            let panels;
            try {
                panels = await getAllReactionRoleMessages(client, guildId);
            } catch {
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels?.length) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const choices = [];
            for (const panel of panels) {
                if (!panel.messageId || !panel.channelId) continue;

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) continue;

                const cachedTitle = channel.messages?.cache?.get(panel.messageId)?.embeds?.[0]?.title;
                const roleCount = Array.isArray(panel.roles) ? panel.roles.length : 0;
                const label = cachedTitle
                    ? `${cachedTitle} (#${channel.name})`
                    : `#${channel.name} · ${roleCount} rol${roleCount === 1 ? '' : 'es'}`;

                choices.push({ name: label.substring(0, 100), value: panel.messageId });
                if (choices.length >= 25) break;
            }

            await interaction.respond(choices).catch(() => {});
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }
};

async function handleSetup(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    
    logger.info(`Configuración de roles de reacción iniciada por ${interaction.user.tag} en el servidor ${interaction.guild.name}`);
    
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        throw createError(
            `Tipo de canal no válido: ${channel.type}`,
            ErrorTypes.VALIDATION,
            'Selecciona un canal de texto o de anuncio.',
            { channelType: channel.type }
        );
    }

    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            'Falta el permiso Gestionar roles',
            ErrorTypes.PERMISSION,
            'Necesito el permiso "Gestionar roles" para configurar los roles de reacción.',
            { permission: 'ManageRoles' }
        );
    }
    
    if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        throw createError(
            `El bot no puede enviar mensajes en ${channel.name}`,
            ErrorTypes.PERMISSION,
            `No tengo permiso para enviar mensajes en ${channel}.`,
            { channelId: channel.id }
        );
    }

    const existingPanels = await getAllReactionRoleMessages(interaction.client, interaction.guildId);
    if (existingPanels && existingPanels.length >= 5) {
        throw createError(
            'Límite de paneles alcanzado',
            ErrorTypes.VALIDATION,
            'Tu servidor ha alcanzado el máximo de 5 paneles de roles de reacción. Elimina un panel existente para crear uno nuevo.',
            { maxPanels: 5, currentPanels: existingPanels.length }
        );
    }

    const roles = [];
    const roleValidationErrors = [];
    const seenRoleIds = new Set();
    
    for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) {
            if (seenRoleIds.has(role.id)) {
                roleValidationErrors.push(`**${role.name}** - Este rol se seleccionó más de una vez`);
                continue;
            }

            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                roleValidationErrors.push(`**${role.name}** - El rol del bot está posicionado más abajo que este rol en la jerarquía del servidor y no puede asignarlo`);
                continue;
            }
            
            if (hasDangerousPermissions(role)) {
                roleValidationErrors.push(`**${role.name}** - Este rol tiene permisos peligrosos (Administrador, Gestionar servidor, etc.)`);
                continue;
            }
            
            if (role.managed) {
                roleValidationErrors.push(`**${role.name}** - Este es un rol gestionado (integración/rol de bot)`);
                continue;
            }
            
            if (role.id === interaction.guild.id) {
                roleValidationErrors.push(`**${role.name}** - No se puede usar el rol @everyone`);
                continue;
            }
            
            seenRoleIds.add(role.id);
            roles.push(role);
        }
    }
    
    if (roleValidationErrors.length > 0) {
        const errorMsg = `Los siguientes roles no se pueden añadir:\n${roleValidationErrors.join('\n')}`;
        
        if (roles.length === 0) {
            throw createError(
                'No se proporcionaron roles válidos',
                ErrorTypes.VALIDATION,
                errorMsg,
                { errors: roleValidationErrors }
            );
        }
        
        await interaction.followUp({
            embeds: [warningEmbed('Advertencia de validación de roles', errorMsg)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (roles.length < 1) {
        throw createError(
            'No se proporcionaron roles',
            ErrorTypes.VALIDATION,
            'Debes proporcionar al menos un rol válido.',
            {}
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_roles')
            .setPlaceholder('Selecciona tus roles')
            .setMinValues(0)
            .setMaxValues(roles.length)
            .addOptions(
                roles.map(role => ({
                    label: truncateText(role.name, SELECT_OPTION_LABEL_LIMIT),
                    description: truncateText(`Añadir o quitar el rol ${role.name}`, SELECT_OPTION_DESCRIPTION_LIMIT),
                    value: role.id,
                    emoji: '🎭'
                }))
            )
    );

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('info'))
        .addFields({
            name: 'Roles disponibles',
            value: roles.map(role => `• ${role}`).join('\n')
        })
        .setFooter({ text: 'Selecciona roles en el menú desplegable de abajo' });

    const message = await channel.send({
        embeds: [panelEmbed],
        components: [row]
    });

    const roleIds = roles.map(role => role.id);
    try {
        await createReactionRoleMessage(
            interaction.client,
            interaction.guildId,
            channel.id,
            message.id,
            roleIds
        );
    } catch (saveError) {
        // The panel is already posted but its data failed to persist, so the dropdown
        // would not work. Remove the orphaned message before surfacing the error.
        await message.delete().catch(() => {});
        throw saveError;
    }

    logger.info(`Mensaje de roles de reacción creado: ${message.id} con ${roles.length} roles por ${interaction.user.tag}`);

    try {
        await logEvent({
            client: interaction.client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.REACTION_ROLE_CREATE,
            data: {
                description: `Panel de roles de reacción creado por ${interaction.user.tag}`,
                userId: interaction.user.id,
                channelId: channel.id,
                fields: [
                    {
                        name: 'Título',
                        value: title,
                        inline: false
                    },
                    {
                        name: 'Canal',
                        value: channel.toString(),
                        inline: true
                    },
                    {
                        name: 'Roles',
                        value: `${roles.length} roles`,
                        inline: true
                    },
                    {
                        name: 'Lista de roles',
                        value: roles.map(r => r.toString()).join(','),
                        inline: false
                    },
                    {
                        name: 'Enlace del mensaje',
                        value: message.url,
                        inline: false
                    }
                ]
            }
        });
    } catch (logError) {
        logger.warn('No se pudo registrar la creación de roles de reacción:', logError);
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Éxito', `✅ Panel de roles de reacción creado en ${channel}!\n\n${message.url}`)]
    });
}

async function fetchPanelDiscordMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return null;
        return await channel.messages.fetch(panelData.messageId).catch(() => null);
    } catch {
        return null;
    }
}

async function rebuildLivePanelMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(panelData.messageId).catch(() => null);
        if (!msg || !msg.embeds[0]) return;

        const roleObjects = panelData.roles
            .map(id => guild.roles.cache.get(id))
            .filter(Boolean);

        if (roleObjects.length === 0) return;

        const currentEmbed = msg.embeds[0];
        const updatedEmbed = EmbedBuilder.from(currentEmbed);
        const fields = currentEmbed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline }));
        const roleFieldIdx = fields.findIndex(f => f.name === 'Roles disponibles');
        const newRoleValue = roleObjects.map(r => `• ${r}`).join('\n');
        if (roleFieldIdx !== -1) {
            fields[roleFieldIdx] = { name: 'Roles disponibles', value: newRoleValue, inline: false };
        } else {
            fields.push({ name: 'Roles disponibles', value: newRoleValue, inline: false });
        }
        updatedEmbed.setFields(fields);

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reaction_roles')
                .setPlaceholder('Selecciona tus roles')
                .setMinValues(0)
                .setMaxValues(roleObjects.length)
                .addOptions(
                    roleObjects.map(r => ({
                        label: r.name.substring(0, 100),
                        description: `Añadir o quitar el rol ${r.name}`.substring(0, 100),
                        value: r.id,
                        emoji: '🎭',
                    })),
                ),
        );

        await msg.edit({ embeds: [updatedEmbed], components: [selectRow] });
    } catch (error) {
        logger.warn('No se pudo reconstruir el panel en vivo de roles de reacción:', error.message);
    }
}

async function showPanelDashboard(interaction, panelData, discordMsg, guildId, guild, client, panelStatus = null) {
    if (!panelStatus && client) {
        panelStatus = await getReactionRolePanelStatus(client, guild, panelData);
        if (panelStatus.recoveredId) {
            await migrateReactionRoleMessageId(client, guildId, panelData, panelStatus.recoveredId);
            discordMsg = panelStatus.message || discordMsg;
        }
    }

    const payload = buildReactionRoleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus);
    await InteractionHelper.safeEditReply(interaction, { ...payload, flags: DASHBOARD_EPHEMERAL });
}

function buildReactionRoleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus = null) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const title = discordMsg?.embeds?.[0]?.title ?? 'Panel sin título';
    const roleList =
        panelData.roles.length > 0
            ? panelData.roles.map(id => `<@&${id}>`).join(',')
            : '`Ninguno`';

    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const embed = new EmbedBuilder()
        .setTitle('Panel de roles de reacción')
        .setDescription(
            `**Título:** ${title}\n\nSelecciona una opción para modificar un ajuste.${discordMsg ? `\n[Haz clic aquí para ver el panel](${discordMsg.url})` : ''}`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: 'Estado del panel', value: formatPanelStatusField(panelStatus), inline: false },
            { name: 'Canal', value: channel ? `<#${channel.id}>` : '`No encontrado`', inline: true },
            { name: 'Roles', value: `\`${panelData.roles.length} / 25\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Lista de roles', value: roleList, inline: false },
        )
        .setFooter({ text: 'El panel se cierra después de 10 minutos de inactividad' })
        .setTimestamp();

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`rr_repost_${guildId}`)
                .setLabel('Volver a publicar panel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌'),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`rr_edit_text_${guildId}`)
            .setLabel('Editar texto del panel')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`rr_delete_${guildId}`)
            .setLabel('Eliminar panel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const optionsSelect = new StringSelectMenuBuilder()
        .setCustomId(`rr_opts_${guildId}`)
        .setPlaceholder('Selecciona una acción...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Añadir rol')
                .setDescription('Añade un rol a este panel (hasta 25 en total)')
                .setValue('add_role')
                .setEmoji('➕'),
            ...(panelData.roles.length > 0
                ? [
                      new StringSelectMenuOptionBuilder()
                          .setLabel('Quitar rol')
                          .setDescription('Quita un rol de este panel')
                          .setValue('remove_role')
                          .setEmoji('➖'),
                  ]
                : []),
        );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(optionsSelect),
        ],
    };
}

async function migrateReactionRoleMessageId(client, guildId, panelData, newMessageId) {
    if (!newMessageId || panelData.messageId === newMessageId) return;
    const oldKey = getReactionRoleKey(guildId, panelData.messageId);
    panelData.messageId = newMessageId;
    await client.db.set(getReactionRoleKey(guildId, newMessageId), panelData);
    await client.db.delete(oldKey).catch(() => {});
}

async function repostReactionRolePanel(guild, panelData, client, guildId, fallbackEmbed = null) {
    const channel = await guild.channels.fetch(panelData.channelId).catch(() => null);
    if (!channel) {
        throw createError(
            'Falta el canal del panel',
            ErrorTypes.CONFIGURATION,
            'El canal del panel configurado ya no existe.',
        );
    }

    const roleObjects = panelData.roles.map(id => guild.roles.cache.get(id)).filter(Boolean);
    if (roleObjects.length === 0) {
        throw createError(
            'No hay roles válidos',
            ErrorTypes.VALIDATION,
            'Este panel no tiene roles válidos para volver a publicarse.',
        );
    }

    const title = fallbackEmbed?.title || 'Roles de reacción';
    const description = fallbackEmbed?.description || 'Selecciona tus roles usando el menú de abajo.';

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('info'))
        .addFields({
            name: 'Roles disponibles',
            value: roleObjects.map(role => `• ${role}`).join('\n'),
        });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_roles')
            .setPlaceholder('Selecciona tus roles')
            .setMinValues(0)
            .setMaxValues(roleObjects.length)
            .addOptions(
                roleObjects.map(role => ({
                    label: role.name.substring(0, 100),
                    description: `Añadir o quitar el rol ${role.name}`.substring(0, 100),
                    value: role.id,
                    emoji: '🎭',
                })),
            ),
    );

    const sent = await channel.send({ embeds: [panelEmbed], components: [row] });
    await migrateReactionRoleMessageId(client, guildId, panelData, sent.id);
    return sent;
}

async function handleDashboard(interaction, selectedPanelId) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: DASHBOARD_EPHEMERAL });
    if (!deferSuccess) return;

    const client = interaction.client;
    const guildId = interaction.guild.id;
    const guild = interaction.guild;

    const panels = await getAllReactionRoleMessages(client, guildId);
    if (!panels?.length) {
        throw createError(
            'No hay paneles',
            ErrorTypes.CONFIGURATION,
            'No se encontraron paneles de roles de reacción. Usa `/reactroles setup` primero.',
        );
    }

    let panelData = selectedPanelId ? panels.find(p => p.messageId === selectedPanelId) : null;
    if (!panelData) {
        if (panels.length === 1) {
            panelData = panels[0];
        } else {
            throw createError(
                'Se requiere un panel',
                ErrorTypes.VALIDATION,
                'Hay varios paneles. Elige uno usando la opción **panel**.',
            );
        }
    }

    let panelStatus = await getReactionRolePanelStatus(client, guild, panelData);
    if (panelStatus.recoveredId) {
        await migrateReactionRoleMessageId(client, guildId, panelData, panelStatus.recoveredId);
        panelStatus = await getReactionRolePanelStatus(client, guild, panelData);
    }

    const discordMsg = panelStatus.message || (await fetchPanelDiscordMessage(guild, panelData));
    const payload = buildReactionRoleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus);

    await startDashboardSession({
        interaction,
        ...payload,
        flags: DASHBOARD_EPHEMERAL,
        selectMenuId: `rr_opts_${guildId}`,
        buttonMatcher: (customId) =>
            customId === `rr_edit_text_${guildId}` ||
            customId === `rr_delete_${guildId}` ||
            customId === `rr_repost_${guildId}`,
        onSelect: async (selectInteraction) => {
            const selectedOption = selectInteraction.values[0];
            if (selectedOption === 'add_role') {
                await handleAddRole(selectInteraction, interaction, panelData, guildId, guild, client);
            } else if (selectedOption === 'remove_role') {
                await handleRemoveRole(selectInteraction, interaction, panelData, panels, guildId, guild, client);
            }
        },
        onButton: async (btnInteraction) => {
            if (btnInteraction.customId === `rr_repost_${guildId}`) {
                await btnInteraction.deferUpdate();
                const fallbackEmbed = discordMsg?.embeds?.[0];
                const newMsg = await repostReactionRolePanel(
                    guild,
                    panelData,
                    client,
                    guildId,
                    fallbackEmbed,
                );
                await btnInteraction.followUp({
                    embeds: [successEmbed('Panel republicado', `El panel de roles de reacción se restauró en ${newMsg.channel}.`)],
                    flags: MessageFlags.Ephemeral,
                });
                await showPanelDashboard(
                    interaction,
                    panelData,
                    newMsg,
                    guildId,
                    guild,
                    client,
                    { exists: true, message: newMsg },
                );
                return;
            }

            if (btnInteraction.customId === `rr_edit_text_${guildId}`) {
                await handleEditText(btnInteraction, interaction, panelData, guildId, guild, client);
                return;
            }

            if (btnInteraction.customId === `rr_delete_${guildId}`) {
                await handleDeletePanel(btnInteraction, interaction, panelData, panels, guildId, guild, client);
            }
        },
    });
}

async function handleEditText(buttonInteraction, rootInteraction, panelData, guildId, guild, client) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const discordMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;

    const currentTitle = discordMsg?.embeds?.[0]?.title ?? '';
    const currentDesc = discordMsg?.embeds?.[0]?.description ?? '';

    const modal = new ModalBuilder()
        .setCustomId('rr_edit_text')
        .setTitle('Editar texto del panel')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_title')
                    .setLabel('Título')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentTitle)
                    .setMaxLength(256)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_description')
                    .setLabel('Descripción')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(currentDesc)
                    .setMaxLength(2048)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await buttonInteraction.showModal(modal);
    } catch (error) {
        logger.error('Error al mostrar el modal de edición del texto del panel:', error);
        await replyUserError(buttonInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'No se pudo abrir el modal para editar el texto del panel. Inténtalo de nuevo.',
        }).catch(() => {});
        return;
    }

    const submitted = await buttonInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'rr_edit_text' && i.user.id === buttonInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newTitle = submitted.fields.getTextInputValue('panel_title').trim();
    const newDescription = submitted.fields.getTextInputValue('panel_description').trim();

    if (discordMsg) {
        const roleObjects = panelData.roles
            .map(id => guild.roles.cache.get(id))
            .filter(Boolean);
        const updatedEmbed = EmbedBuilder.from(discordMsg.embeds[0])
            .setTitle(newTitle)
            .setDescription(newDescription);
        if (roleObjects.length > 0) {
            const fields = discordMsg.embeds[0].fields?.map(f => ({ name: f.name, value: f.value, inline: f.inline })) || [];
            const roleFieldIdx = fields.findIndex(f => f.name === 'Roles disponibles');
            const newRoleValue = roleObjects.map(r => `• ${r}`).join('\n');
            if (roleFieldIdx !== -1) {
                fields[roleFieldIdx] = { name: 'Roles disponibles', value: newRoleValue, inline: false };
            } else {
                fields.push({ name: 'Roles disponibles', value: newRoleValue, inline: false });
            }
            updatedEmbed.setFields(fields);
        }
        await discordMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }

    await submitted.reply({
        embeds: [successEmbed('Panel actualizado', 'El título y la descripción se han actualizado.')],
        flags: MessageFlags.Ephemeral,
    });

    const refreshedMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    await showPanelDashboard(rootInteraction, panelData, refreshedMsg, guildId, guild, client);
}

async function handleAddRole(selectInteraction, rootInteraction, panelData, guildId, guild, client) {
    await selectInteraction.deferUpdate();

    if (panelData.roles.length >= 25) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.VALIDATION,
            message: 'Este panel ya tiene el máximo de 25 roles.',
        });
        return;
    }

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('rr_add_role_pick')
        .setPlaceholder('Selecciona un rol para añadir...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Añadir rol')
                .setDescription(
                    `**Roles actuales:** ${panelData.roles.length}/25\n\nSelecciona un rol para añadir a este panel.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_add_role_pick',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        if (panelData.roles.includes(role.id)) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: `${role} ya está en este panel.`,
            });
            return;
        }
        if (role.id === guild.id) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'No puedes usar @everyone.',
            });
            return;
        }
        if (role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'Los roles gestionados/roles de bot no se pueden usar.',
            });
            return;
        }
        if (hasDangerousPermissions(role)) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'Ese rol tiene permisos sensibles (Administrador, Gestionar servidor, etc.) y no se puede usar.',
            });
            return;
        }
        if (role.position >= guild.members.me.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'Ese rol está por encima de mi rol más alto en la jerarquía. Primero mueve mi rol por encima de él.',
            });
            return;
        }

        panelData.roles.push(role.id);
        const key = getReactionRoleKey(guildId, panelData.messageId);
        await client.db.set(key, panelData);

        await rebuildLivePanelMessage(guild, panelData);

        await roleInteraction.followUp({
            embeds: [successEmbed('Rol añadido', `${role} se ha añadido al panel.`)],
            flags: MessageFlags.Ephemeral,
        });

        const channel = guild.channels.cache.get(panelData.channelId);
        const discordMsg = channel
            ? await channel.messages.fetch(panelData.messageId).catch(() => null)
            : null;
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se seleccionó ningún rol. No se cambió nada.',
            }).catch(() => {});
        }
    });
}

async function handleRemoveRole(selectInteraction, rootInteraction, panelData, panels, guildId, guild, client) {
    await selectInteraction.deferUpdate();

    const roleOptions = panelData.roles
        .map(id => {
            const role = guild.roles.cache.get(id);
            return role ? { label: role.name.substring(0, 100), value: id } : null;
        })
        .filter(Boolean);

    if (roleOptions.length === 0) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Los roles de este panel ya no existen en el servidor.',
        });
        return;
    }

    const removeSelect = new StringSelectMenuBuilder()
        .setCustomId('rr_remove_role_pick')
        .setPlaceholder('Selecciona un rol para quitar...')
        .setMaxValues(1)
        .addOptions(
            roleOptions.map(r =>
                new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.value).setEmoji('🎭'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Quitar rol')
                .setDescription('Selecciona el rol que quieres quitar del panel.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(removeSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_remove_role_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInteraction => {
        await removeInteraction.deferUpdate();
        const roleId = removeInteraction.values[0];
        const role = guild.roles.cache.get(roleId);

        panelData.roles = panelData.roles.filter(id => id !== roleId);

        if (panelData.roles.length === 0) {
            const channel = guild.channels.cache.get(panelData.channelId);
            if (channel) {
                const msg = await channel.messages.fetch(panelData.messageId).catch(() => null);
                if (msg) await msg.delete().catch(() => {});
            }
            await deleteReactionRoleMessage(client, guildId, panelData.messageId);

            await removeInteraction.followUp({
                embeds: [
                    successEmbed(
                        '✅ Rol quitado',
                        'Ese era el último rol del panel. El panel ha sido eliminado.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const panelIndex = panels.findIndex(p => p.messageId === panelData.messageId);
            if (panelIndex > -1) {
                panels.splice(panelIndex, 1);
            }

            if (panels.length === 0) {
                await InteractionHelper.safeEditReply(rootInteraction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Panel de roles de reacción')
                            .setDescription('No quedan paneles. Usa `/reactroles setup` para crear uno.')
                            .setColor(getColor('info')),
                    ],
                    components: [],
                    flags: DASHBOARD_EPHEMERAL,
                });
            } else {
                
                await InteractionHelper.safeEditReply(rootInteraction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Panel de roles de reacción')
                            .setDescription('El panel se eliminó. Ejecuta `/reactroles dashboard` para gestionar otro panel.')
                            .setColor(getColor('success')),
                    ],
                    components: [],
                    flags: DASHBOARD_EPHEMERAL,
                });
            }
        } else {
            const key = getReactionRoleKey(guildId, panelData.messageId);
            await client.db.set(key, panelData);
            await rebuildLivePanelMessage(guild, panelData);

            await removeInteraction.followUp({
                embeds: [
                    successEmbed(
                        '✅ Rol quitado',
                        `${role ? role.toString() :`<@&${roleId}>`} se ha quitado del panel.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const channel = guild.channels.cache.get(panelData.channelId);
            const discordMsg = channel
                ? await channel.messages.fetch(panelData.messageId).catch(() => null)
                : null;
            await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
        }
    });

    removeCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No se seleccionó ningún rol. No se cambió nada.',
            }).catch(() => {});
        }
    });
}

async function handleDeletePanel(btnInteraction, rootInteraction, panelData, panels, guildId, guild, client) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const discordMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    const title = discordMsg?.embeds?.[0]?.title ?? 'este panel';

    const deleteModal = new ModalBuilder()
        .setCustomId('rr_delete_confirm_modal')
        .setTitle('Eliminar panel de roles de reacción');

    const deleteWarningText = new TextDisplayBuilder()
        .setContent(`⚠️ Vas a eliminar permanentemente el panel **${title}**. Esto eliminará el mensaje de Discord y todas las asignaciones de roles de reacción asociadas.`);

    const deleteCheckbox = new CheckboxBuilder()
        .setCustomId('delete_confirmation')
        .setDefault(false);

    const deleteCheckboxLabel = new LabelBuilder()
        .setLabel('Confirmo — esto no se puede deshacer')
        .setCheckboxComponent(deleteCheckbox);

    deleteModal
        .addTextDisplayComponents(deleteWarningText)
        .addLabelComponents(deleteCheckboxLabel);

    await btnInteraction.showModal(deleteModal);

    const submitted = await btnInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'rr_delete_confirm_modal' && i.user.id === btnInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
        return;
    }

    const confirmed = submitted.fields.getCheckbox('delete_confirmation');

    if (!confirmed) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Debes marcar la casilla de confirmación para eliminar el panel.' });
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
        return;
    }

    await submitted.deferUpdate();

    if (discordMsg) {
        await discordMsg.delete().catch(() => {});
    }
    await deleteReactionRoleMessage(client, guildId, panelData.messageId);

    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
            data: {
                description: `Panel de roles de reacción eliminado por ${submitted.user.tag}`,
                userId: submitted.user.id,
                channelId: panelData.channelId,
                fields: [
                    { name: 'Panel', value: title, inline: true },
                    { name: 'Canal', value: channel ? channel.toString() : 'Desconocido', inline: true },
                ],
            },
        });
    } catch (logErr) {
        logger.warn('No se pudo registrar la eliminación del panel de roles de reacción:', logErr);
    }

    await submitted.followUp({
        embeds: [successEmbed('Panel eliminado', `**${title}** se ha eliminado.`)],
        flags: MessageFlags.Ephemeral,
    });

    const panelIndex = panels.findIndex(p => p.messageId === panelData.messageId);
    if (panelIndex > -1) {
        panels.splice(panelIndex, 1);
    }

    if (panels.length === 0) {
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Panel de roles de reacción')
                    .setDescription('No quedan paneles. Usa `/reactroles setup` para crear uno.')
                    .setColor(getColor('info')),
            ],
            components: [],
            flags: DASHBOARD_EPHEMERAL,
        });
    } else {
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Panel de roles de reacción')
                    .setDescription('El panel se eliminó. Ejecuta `/reactroles dashboard` para gestionar otro panel.')
                    .setColor(getColor('success')),
            ],
            components: [],
            flags: DASHBOARD_EPHEMERAL,
        });
    }
}
