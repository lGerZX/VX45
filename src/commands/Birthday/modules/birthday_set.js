import { EmbedBuilder } from 'discord.js';
import { setBirthday } from '../../../services/birthdayService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const month = interaction.options.getInteger("month");
        const day = interaction.options.getInteger("day");
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            // Llamada al servicio de cumpleaños
            const result = await setBirthday(client, guildId, userId, month, day);

            // Si el servicio responde que no tuvo éxito
            if (!result || !result.success || !result.data) {
                console.log('❌ El servicio setBirthday devolvió un fallo:', result);

                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('Error')
                    .setDescription(result?.message || 'No se pudo guardar la fecha en la base de datos.');

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed]
                });
            }

            // Si todo salió bien
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('¡Cumpleaños guardado!')
                .setDescription(`Tu cumpleaños ha sido programado para **${result.data.monthName} ${result.data.day}**!`);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });

        } catch (error) {
            // Captura errores no controlados (ej. fallos de conexión a DB)
            console.error('❌ Error crítico en setBirthday:', error);

            const failEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Error interno')
                .setDescription('Ocurrió un error inesperado al procesar tu solicitud.');

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [failEmbed]
            });
        }
    }
};
