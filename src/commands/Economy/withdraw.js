import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Retira dinero de tu banco a tu billetera')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Monto a retirar')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getInteger("amount");

        const userData = await getEconomyData(client, guildId, userId);
            
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "Error al cargar tus datos de economia intentalo mas tarde",
                { userId, guildId }
            );
        }

        let withdrawAmount = amountInput;

        if (withdrawAmount <= 0) {
            throw createError(
                "Invalid withdrawal amount",
                ErrorTypes.VALIDATION,
                "Debes retirar un monto positivo",
                { amount: withdrawAmount, userId }
            );
        }

        if (withdrawAmount > userData.bank) {
            withdrawAmount = userData.bank;
        }

        if (withdrawAmount === 0) {
            throw createError(
                "Empty bank account",
                ErrorTypes.VALIDATION,
                "Tu cuenta bancaria esta vacia",
                { userId, bankBalance: userData.bank }
            );
        }

        userData.wallet += withdrawAmount;
        userData.bank -= withdrawAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            'Retiro exitoso',
            `Retiraste con exito **$${withdrawAmount.toLocaleString()}** de tu banco`
        )
            .addFields(
                {
                    name: "Nuevo saldo en efectivo",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Nuevo saldo bancario",
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
