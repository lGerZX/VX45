import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("Administra estadisticas del servidor que registran conteos de miembros y datos de canales")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Crea un nuevo canal de seguimiento de estadisticas en una categoria")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("El tipo de estadisticas a registrar")
                        .setRequired(true)
                        .addChoices(
                            { name: "miembros + bots", value: "members" },
                            { name: "solo miembros", value: "members_only" },
                            { name: "solo bots", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("El tipo de canal a crear para este seguimiento")
                        .setRequired(true)
                        .addChoices(
                            { name: "canal de voz recomendado", value: "voice" },
                            { name: "canal de texto", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("La categoria donde se creara el canal de seguimiento de estadisticas")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Muestra todos los seguimientos de estadisticas del servidor")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("Actualiza un seguimiento de estadisticas existente")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("El ID del seguimiento a actualizar")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("El nuevo tipo de seguimiento")
                        .setRequired(false)
                        .addChoices(
                            { name: "miembros + bots", value: "members" },
                            { name: "solo miembros", value: "members_only" },
                            { name: "solo bots", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Elimina un seguimiento de estadisticas existente")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("El ID del seguimiento a eliminar")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "update":
                await handleUpdate(interaction, client);
                break;
            case "delete":
                await handleDelete(interaction, client);
                break;
            default:
                await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Subcomando desconocido' });
        }
    }
};
