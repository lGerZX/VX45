import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Bannear a un usuario del servidor")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("El usuario a bannear")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Razon del ban"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "No se proporciono una razon";

        if (!user) {
            throw new TitanBotError(
                'Falta el usuario objetivo',
                ErrorTypes.USER_INPUT,
                'Debes especificar un usuario para bannear',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotError(
                'No te puedes bannear a ti mismo',
                ErrorTypes.VALIDATION,
                'No te puedes bannear a ti mismo',
            );
        }
        if (user.id === client.user.id) {
            throw new TitanBotError(
                'No se puede bannear al bot',
                ErrorTypes.VALIDATION,
                'No puedes bannear al bot',
            );
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild,
            user,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `🚫 **Baneado** ${user.tag}`,
                    `**Razon:** ${reason}\n**ID del caso:** #${result.caseId}`,
                ),
            ],
        });
    },
};
