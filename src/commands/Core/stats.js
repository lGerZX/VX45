import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Ver estadisticas del bot"),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const totalGuilds = interaction.client.guilds.cache.size;
            const totalMembers = interaction.client.guilds.cache.reduce(
                (acc, guild) => acc + guild.memberCount,
                0,
            );
            const nodeVersion = process.version;

            const embed = createEmbed({ title: "Estadisticas del sistema", description: "Metricas de rendimiento en tiempo real" }).addFields(
                { name: "Servidores", value: `${totalGuilds}`, inline: true },
                { name: "Usuarios", value: `${totalMembers}`, inline: true },
                { name: "Node.js", value: `${nodeVersion}`, inline: true },
                { name: "Discord.js", value: `v${version}`, inline: true },
                {
                    name: "Uso de memoria",
                    value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    inline: true,
                },
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Stats command error:', error);
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: 'Error del sistema', description: 'No se pudieron obtener las estadisticas del sistema', color: 'error' })],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
