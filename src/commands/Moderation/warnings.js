import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Ver todas las advertencias de un usuario")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Usuario para revisar advertencias"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warnings interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warnings',
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const guildId = interaction.guildId;

        const validWarnings = await WarningService.getWarnings(guildId, target.id);
        const totalWarns = validWarnings.length;

        if (totalWarns === 0) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: `Advertencias: ${target.tag}`,
                        description: "Este usuario no tiene advertencias registradas",
                    }).setColor(getColor('success')),
                ],
            });
            return;
        }

        const embed = createEmbed({
            title: `Advertencias: ${target.tag}`,
            description: `Total de Advertencias: **${totalWarns}**`,
        }).setColor(getColor('warning'));

        const warningFields = validWarnings
            .map((w, i) => {
                const discordTimestamp = Math.floor(w.timestamp / 1000);
                return {
                    name: `[#${i + 1}] Razon: ${w.reason.substring(0, 100)}`,
                    value: `**Moderador:** <@${w.moderatorId}>\n**Fecha:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                    inline: false,
                };
            })
            .slice(0, 25);

        embed.addFields(warningFields);

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`warning_delete_specific:${target.id}:${interaction.user.id}`)
                .setLabel('Delete Specific Warning')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`warning_clear_all:${target.id}:${interaction.user.id}`)
                .setLabel('Clear All Warnings')
                .setStyle(ButtonStyle.Danger),
        );

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Advertencias Vistas",
                target: `${target.tag} (${target.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: `Vistas ${totalWarns} advertencias`,
                metadata: {
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    totalWarnings: totalWarns,
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [actionRow] });
    },
};
