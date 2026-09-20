import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../services/leveling/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Quitar niveles a un usuario')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('El usuario al que se le quitaran niveles')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Numero de niveles a quitar')
        .setRequired(true)
        .setMinValue(1)
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
    const levelsToRemove = interaction.options.getInteger('levels');

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      throw new TitanBotError(
        `Usuario ${targetUser.id} no encontrado en este servidor`,
        ErrorTypes.USER_INPUT,
        'El usuario especificado no esta en este servidor'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
    if (userData.level === 0) {
      throw new TitanBotError(
        `El usuario ${targetUser.id} ya esta en el nivel minimo`,
        ErrorTypes.VALIDATION,
        `${targetUser.tag} ya esta en el nivel 0 y no se le pueden quitar niveles`
      );
    }

    const updatedData = await removeLevels(client, interaction.guildId, targetUser.id, levelsToRemove);

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Niveles quitados',
          description: `Se quitaron con exito ${levelsToRemove} niveles a ${targetUser.tag}\n**Nuevo nivel:** ${updatedData.level}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] El usuario ${interaction.user.tag} quito ${levelsToRemove} niveles a ${targetUser.tag} en el servidor ${interaction.guildId}`
    );
  }
};
