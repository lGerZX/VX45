import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Desbanea a un usuario del servidor")
        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("El ID o mencion del usuario a desbanear")
                .setRequired(true),
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Razon para el desbaneo")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban',
            });
            return;
        }

        const rawTarget = interaction.options.getString("target");
        const targetId = rawTarget.replace(/[<@!>]/g, '').trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Por favor proporciona un ID de usuario o mencion valida',
            });
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `No se pudo encontrar un usuario con el ID \`${targetId}\``,
            });
        }

        const reason = interaction.options.getString("reason") || "Razon no proporcionada";

        const result = await ModerationService.unbanUser({
            guild: interaction.guild,
            user: targetUser,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "✅ Usuario Desbaneado",
                    `Se desbaneo exitosamente a **${targetUser.tag}** del servidor\n\n**Razon:** ${reason}\n**ID de Caso:** #${result.caseId}`,
                ),
            ],
        });
    },
};
