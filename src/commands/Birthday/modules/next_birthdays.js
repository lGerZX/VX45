import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

        if (next5.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('No se encontraron cumpleaños')
                .setDescription('Aun no se han configurado cumpleaños en este servidor. Usa `/birthday set` para añadir cumpleaños');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Hoy**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Mañana**';
            } else {
                timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Sin proximos cumpleaños')
                .setDescription('No se encontraron proximos cumpleaños de los miembros actuales del servidor');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let birthdayList = `🎂 **Próximos 5 cumpleaños**\n\nAquí están los próximos 5 cumpleaños en ${interaction.guild.name}:\n\n`;
        displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Hoy**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Mañana**';
            } else {
                timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
            }

            birthdayList += `${displayIndex}. **${member.displayName}**\n<@${birthday.userId}>\n📅 **Fecha:** ${birthday.monthName} ${birthday.day}\n⏰ **Tiempo:** ${timeUntil}\n\n`;
        }

        birthdayList += `Usa /birthday set para añadir tu cumpleaños`;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Proximos 5 cumpleaños')
            .setDescription(birthdayList);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Proximos cumpleaños recuperados con exito', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'next_birthdays'
        });
    }
};
