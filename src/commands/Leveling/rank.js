import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../services/leveling/leveling.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Consulta tu rango y nivel o el de otro usuario")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('El usuario del que deseas consultar el rango')
        .setRequired(false)
    )
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('El sistema de nivelacion esta actualmente desactivado en este servidor')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new TitanBotError(
        `Usuario ${targetUser.id} no encontrado en el servidor`,
        ErrorTypes.USER_INPUT,
        'No se pudo encontrar al usuario especificado en este servidor'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);

    const safeUserData = {
      level: userData?.level ?? 0,
      xp: userData?.xp ?? 0,
      totalXp: userData?.totalXp ?? 0
    };

    const xpNeeded = getXpForLevel(safeUserData.level + 1);
    const progress = xpNeeded > 0 ? Math.floor((safeUserData.xp / xpNeeded) * 100) : 0;
    const progressBar = createProgressBar(progress, 20);

    const embed = new EmbedBuilder()
      .setTitle(`Rango de ${member.displayName}`)
      .setThumbnail(member.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: 'Nivel',
          value: safeUserData.level.toString(),
          inline: true
        },
        {
          name: 'XP',
          value: `${safeUserData.xp}/${xpNeeded}`,
          inline: true
        },
        {
          name: 'XP total',
          value: safeUserData.totalXp.toString(),
          inline: true
        },
        {
          name: `Progreso al Nivel ${safeUserData.level + 1}`,
          value: `${progressBar} ${progress}%`
        }
      )
      .setColor('#2ecc71')
      .setTimestamp();

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Rango consultado para el usuario ${targetUser.id} en el servidor ${interaction.guildId}`);
  }
};

function createProgressBar(percentage, length = 10) {
  if (percentage < 0 || percentage > 100) {
    percentage = Math.max(0, Math.min(100, percentage));
  }
  const filled = Math.round((percentage / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}
