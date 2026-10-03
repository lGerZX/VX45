import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Administra el sistema de tickets del servidor")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Configura el panel de creacion de tickets en un canal especificado",
                )
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription(
                            "El canal donde se enviara el panel de tickets",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "El mensaje principal o descripcion del panel de tickets",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "La etiqueta del boton de creacion de tickets por defecto Crear ticket",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "La categoria donde se crearan los nuevos tickets opcional",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "La categoria donde se moveran los tickets cerrados opcional",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "El rol que puede acceder a los tickets opcional",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Numero maximo de tickets que un usuario puede crear por defecto 3")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Enviar MD al usuario cuando se cierre su ticket por defecto true")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Abre el panel interactivo del sistema de tickets"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas el permiso `Manage Channels` para esta accion' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Este servidor ya tiene un sistema de tickets configurado en <#${existingConfig.ticketPanelChannelId}>` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
            const panelMessage = interaction.options.getString("panel_message") || "Haz clic en el boton de abajo para crear un ticket de soporte";
            const buttonLabel =
                interaction.options.getString("button_label") ||
                "Crear ticket";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
            const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "! AstrxlzzL", 
                description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket configuration saved', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Ticket setup: database unavailable, panel sent but configuration was NOT saved', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `El panel de creacion de tickets se envio a ${panelChannel}`;

                if (categoryChannel) {
                    successMessage += `Los nuevos tickets se crearan en la categoria **${categoryChannel.name}**`;
                } else {
                    successMessage += 'Los nuevos tickets se crearan en una categoria nueva llamada Tickets';
                }

                if (closedCategoryChannel) {
                    successMessage += `Los tickets cerrados se moveran a **${closedCategoryChannel.name}**`;
                }

                if (staffRole) {
                    successMessage += `El rol **${staffRole.name}** tendra acceso a los tickets`;
                }

                successMessage += `\n\n**Maximo de tickets por usuario:** ${maxTicketsPerUser}\n**MD al cerrar:** ${dmOnClose ? 'Activado' : 'Desactivado'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Panel de tickets configurado",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Ticket panel setup completed', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "Configuracion del sistema de tickets (registro)",
                    description: `El panel de tickets se configuro en ${panelChannel} por ${interaction.user}`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Canal del panel",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Categoria de tickets",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "No se especifico",
                            inline: true,
                        },
                        {
                            name: "Categoria cerrada",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "No se especifico",
                            inline: true,
                        },
                        {
                            name: "Rol del staff",
                            value: staffRole
                                ? staffRole.toString()
                                : "No se especifico",
                            inline: true,
                        },
                        {
                            name: "Maximo de tickets por usuario",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "MD al cerrar",
                            value: dmOnClose ? 'Activado' : 'Desactivado',
                            inline: true,
                        },
                        {
                            name: "Moderador",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ticket setup error', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'No se pudo enviar el panel de tickets o guardar la configuracion. Revisa los permisos del bot especialmente la capacidad para enviar mensajes y administrar canales' }).catch((err) => {
                        logger.error('Failed to send error reply', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};
