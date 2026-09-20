import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Expulsar a un usuario del servidor")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("El usuario a expulsar")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Razon para la expulsion"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "No se proporciono una razon";

        if (!targetUser) {
            throw new TitanBotError(
                'Falta el usuario objetivo',
                ErrorTypes.USER_INPUT,
                'Debes especificar un usuario para expulsar',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "No te puedes expulsar a ti mismo",
                ErrorTypes.VALIDATION,
                "No te puedes expulsar a ti mismo",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "No se puede expulsar al bot",
                ErrorTypes.VALIDATION,
                "No puedes expulsar al bot",
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Objetivo no encontrado",
                ErrorTypes.USER_INPUT,
                "El usuario objetivo no se encuentra actualmente en este servidor",
                { subtype: 'user_not_found' },
            );
        }

        const result = await ModerationService.kickUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `👢 **Expulsado** ${targetUser.tag}`,
                    `**Razon:** ${reason}\n**ID del caso:** #${result.caseId}`,
                ),
            ],
        });
    },
};
