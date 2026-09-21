import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction) {
        const query = interaction.options.getString('query');
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        const embed = createEmbed({
            title: 'Google Search',
            description: `[Buscar "${query}"](${searchUrl})`,
            color: 'info'
        })
        .setFooter({ text: 'Resultados de Google Search' });

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });

        logger.info('Google search link generated', {
            userId: interaction.user.id,
            query: query,
            guildId: interaction.guildId,
            commandName: 'google'
        });
    },
};
