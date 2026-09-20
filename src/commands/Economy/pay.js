import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Paga a otro usuario una cantidad de tu dinero')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Usuario al que vas a pagar')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Monto que deseas transferir')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const senderId = interaction.user.id;
        const receiver = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Pay command initiated`, { 
            senderId, 
            receiverId: receiver.id,
            amount,
            guildId
        });

        if (receiver.bot) {
            throw createError(
                "Cannot pay bot",
                ErrorTypes.VALIDATION,
                "No puedes pagar a un bot",
                { receiverId: receiver.id, isBot: true }
            );
        }
            
        if (receiver.id === senderId) {
            throw createError(
                "Cannot pay self",
                ErrorTypes.VALIDATION,
                "No te puedes pagar a ti mismo",
                { senderId, receiverId: receiver.id }
            );
        }
            
        if (amount <= 0) {
            throw createError(
                "Invalid payment amount",
                ErrorTypes.VALIDATION,
                "El monto ingresado debe ser mayor a cero",
                { amount, senderId }
            );
        }

        const [senderData, receiverData] = await Promise.all([
            getEconomyData(client, guildId, senderId),
            getEconomyData(client, guildId, receiver.id)
        ]);

        if (!senderData) {
            throw createError(
                "Failed to load sender economy data",
                ErrorTypes.DATABASE,
                "Error al cargar tus datos de economia intentalo mas tarde",
                { userId: senderId, guildId }
            );
        }
            
        if (!receiverData) {
            throw createError(
                "Failed to load receiver economy data",
                ErrorTypes.DATABASE,
                "Error al cargar los datos del destinatario intentalo mas tarde",
                { userId: receiver.id, guildId }
            );
        }

        const result = await EconomyService.transferMoney(
            client, 
            guildId, 
            senderId, 
            receiver.id, 
            amount
        );

        const updatedSenderData = await getEconomyData(client, guildId, senderId);
        const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

        const embed = successEmbed(
            'Pago exitoso',
            `Pagaste a **${receiver.username}** la cantidad de **$${amount.toLocaleString()}**`
        )
            .addFields(
                {
                    name: "Monto transferido",
                    value: `$${amount.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Tu nuevo saldo",
                    value: `$${updatedSenderData.wallet.toLocaleString()}`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Enviado a ${receiver.tag}`,
                iconURL: receiver.displayAvatarURL(),
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        logger.info(`[ECONOMY] Payment sent successfully`, {
            senderId,
            receiverId: receiver.id,
            amount,
            senderBalance: updatedSenderData.wallet,
            receiverBalance: updatedReceiverData.wallet
        });

        try {
            const receiverEmbed = createEmbed({ 
                title: "Pago recibido", 
                description: `${interaction.user.username} te pagó **$${amount.toLocaleString()}**` 
            }).addFields({
                name: "Tu nuevo saldo",
                value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                inline: true,
            });
            await receiver.send({ embeds: [receiverEmbed] });
        } catch (e) {
            logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
        }
    }, { command: 'pay' })
};
