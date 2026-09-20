import { EmbedBuilder } from 'discord.js';
import { setBirthday } from '../../../services/birthdayService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        // 1. Coincidencia de nombres con la definición del SlashCommand ('month' y 'day')
        const month = interaction.options.getInteger("month");
        const day = interaction.options.getInteger("day");
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await setBirthday(client, guildId, userId, month, day);

        // 2. Control de errores si el servicio no puede guardar la fecha
        if (!result || !result.success) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Error')
                .setDescription(result?.message || 'Ocurrió un error al intentar guardar tu cumpleaños.');

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Cumpleaños guardado')
            .setDescription(`Tu cumpleaños ha sido programado para **${result.data.monthName} ${result.data.day}**!`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
};
