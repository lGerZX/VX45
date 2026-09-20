import { EmbedBuilder } from 'discord.js';
import { deleteBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await deleteBirthday(client, guildId, userId);

        if (result.status === 'no encontrado') {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('No se encontro ningún cumpleaños')
                .setDescription('No tienes configurada ninguna fecha de nacimiento para eliminar');
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Fecha de nacimiento eliminada')
            .setDescription('Tu fecha de nacimiento se ha eliminado correctamente del servidor');
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
};
