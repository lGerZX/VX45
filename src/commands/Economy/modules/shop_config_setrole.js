import { PermissionsBitField } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas permisos de **Gestionar Servidor** para establecer el rol premium' });
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = role.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Rol premium establecido', `El **Rol de la tienda premium** se ha establecido en ${role.toString()} Los miembros que compren el objeto de Rol Premium obtendran este rol`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'No se pudo guardar la configuracion del servidor' });
        }
    },
};
