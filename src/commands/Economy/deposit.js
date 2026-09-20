import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposita dinero de tu billetera en tu banco')
        .addStringOption(option =>
            option
                .setName('monto')
                .setDescription('Monto a depositar (numero o "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString("monto") || interaction.options.getString("amount");

        const userData = await getEconomyData(client, guildId, userId);
        
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "No se pudieron cargar tus datos de economia Intentalo de nuevo mas tarde",
                { userId, guildId }
            );
        }
        
        const maxBank = getMaxBankCapacity(userData);
        let depositAmount;

        if (amountInput.toLowerCase() === "all") {
            depositAmount = userData.wallet;
        } else {
            depositAmount = parseInt(amountInput);

            if (isNaN(depositAmount) || depositAmount <= 0) {
                throw createError(
                    "Invalid deposit amount",
                    ErrorTypes.VALIDATION,
                    `Ingresa un numero valido o 'all' Ingresaste: \`${amountInput}\``,
                    { amountInput, userId }
                );
            }
        }

        if (depositAmount === 0) {
            throw createError(
                "Zero deposit amount",
                ErrorTypes.VALIDATION,
                "No tienes dinero en efectivo para depositar",
                { userId, walletBalance: userData.wallet }
            );
        }

        if (depositAmount > userData.wallet) {
            depositAmount = userData.wallet;
            await interaction.followUp({
                embeds: [
                    buildUserErrorEmbed(
                        'validation',
                        `Intentaste depositar mas de lo que tienes Depositando tu dinero restante: **$${depositAmount.toLocaleString()}**`
                    )
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const availableSpace = maxBank - userData.bank;

        if (availableSpace <= 0) {
            throw createError(
                "Bank is full",
                ErrorTypes.VALIDATION,
                `Tu banco esta lleno (Capacidad maxima: $${maxBank.toLocaleString()}) Compra una **Mejora de banco** para aumentar tu limite`,
                { maxBank, currentBank: userData.bank, userId }
            );
        }

        if (depositAmount > availableSpace) {
            const originalDepositAmount = depositAmount;
            depositAmount = availableSpace;

            if (amountInput.toLowerCase() !== "all") {
                await interaction.followUp({
                    embeds: [
                        buildUserErrorEmbed(
                            'validation',
                            `Solo tenias espacio para **$${depositAmount.toLocaleString()}** en tu cuenta bancaria (Maximo: $${maxBank.toLocaleString()}) El resto se queda en tu efectivo`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        if (depositAmount === 0) {
            throw createError(
                "No space or cash for deposit",
                ErrorTypes.VALIDATION,
                "El monto que intentaste depositar era 0 o superaba la capacidad de tu banco tras verificar tu saldo",
                { depositAmount, availableSpace, walletBalance: userData.wallet }
            );
        }

        userData.wallet -= depositAmount;
        userData.bank += depositAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            'Deposito exitoso',
            `Depositaste exitosamente **$${depositAmount.toLocaleString()}** en tu banco`
        )
            .addFields(
                {
                    name: "Nuevo saldo en efectivo",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Nuevo saldo bancario",
                    value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};
