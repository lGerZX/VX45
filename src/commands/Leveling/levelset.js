import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { setUserLevel, getLevelingConfig } from '../../services/leveling/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription("Establecer el nivel de un usuario a un valor especifico")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('El usuario al que se le establecera el nivel')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('El nivel a establecer')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'Necesitas el permiso ManageGuild para usar este comando'
    );
    if (!hasPermission) return;

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

    const targetUser = interaction.options.getUser('user');
    const newLevel = interaction.options.getInteger('level');

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      throw new TitanBotError(
        `Usuario ${targetUser.id} no encontrado en este servidor`,
        ErrorTypes.USER_INPUT,
        'El usuario especificado no esta en este servidor'
      );
    }

    const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Nivel establecido',
          description: `Se establecio con exito el nivel de ${targetUser.tag} en **${newLevel}**\n**XP total:** ${userData.totalXp}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] El usuario ${interaction.user.tag} establecio el nivel de ${targetUser.tag} en ${newLevel} en el servidor ${interaction.guildId}`
    );
  }
};
