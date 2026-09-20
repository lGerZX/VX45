import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Aposta tu dinero para tener la oportunidad de ganar mas')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Cantidad de dinero a apostar')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger("amount");
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastGamble = userData.lastGamble || 0;
        let cloverCount = userData.inventory["lucky_clover"] || 0;
        let charmCount = userData.inventory["lucky_charm"] || 0;

        if (now < lastGamble + GAMBLE_COOLDOWN) {
            const remaining = lastGamble + GAMBLE_COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            throw createError(
                "Gamble cooldown active",
                ErrorTypes.RATE_LIMIT,
                `Debes esperar antes de volver a apostar. Espera **${minutes}m ${seconds}s**.`,
                { remaining, cooldownType: 'gamble' }
            );
        }

        if (userData.wallet < betAmount) {
            throw createError(
                "Insufficient cash for gamble",
                ErrorTypes.VALIDATION,
                `Solo tienes $${userData.wallet.toLocaleString()} en efectivo, pero intentas apostar $${betAmount.toLocaleString()}.`,
                { required: betAmount, current: userData.wallet }
            );
        }

        let winChance = BASE_WIN_CHANCE;
        let cloverMessage = "";
        let usedClover = false;
        let usedCharm = false;

        if (cloverCount > 0) {
            winChance += CLOVER_WIN_BONUS;
            userData.inventory["lucky_clover"] -= 1;
            cloverMessage = `\n🍀 **Trebol de la suerte consumido:** ¡Tus probabilidades de ganar aumentaron!`;
            usedClover = true;
        }
        else if (charmCount > 0) {
            winChance += CHARM_WIN_BONUS;
            userData.inventory["lucky_charm"] -= 1;
            cloverMessage = `\n🍀 **Amuleto de la suerte usado (quedan ${charmCount - 1} usos):** ¡Tus probabilidades de ganar aumentaron!`;
            usedCharm = true;
        }

        const win = Math.random() < winChance;
        let cashChange = 0;
        let resultEmbed;

        if (win) {
            const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
            // Net change: the bet is replaced by the payout (bet was at stake, not pre-deducted)
            cashChange = amountWon - betAmount;

            resultEmbed = successEmbed(
                "🎉 ¡Ganaste!",
                `¡Apostaste con exito y convertiste tu apuesta de **$${betAmount.toLocaleString()}** en **$${amountWon.toLocaleString()}**!${cloverMessage}`,
            );
        } else {
            cashChange = -betAmount;

            resultEmbed = warningEmbed(
                "💔 Perdiste...",
                `Los dados no estuvieron a tu favor. Perdiste tu apuesta de **$${betAmount.toLocaleString()}**.`,
            );
        }

        userData.wallet = (userData.wallet || 0) + cashChange;
        userData.lastGamble = now;

        await setEconomyData(client, guildId, userId, userData);

        const newCash = userData.wallet;

        resultEmbed.addFields({
            name: "Nuevo saldo en efectivo",
            value: `$${newCash.toLocaleString()}`,
            inline: true,
        });

        if (usedClover) {
            resultEmbed.setFooter({
                text: `Te quedan ${userData.inventory["lucky_clover"]} treboles de la suerte. Probabilidad de ganar: ${Math.round(winChance * 100)}%.`,
            });
        } else if (usedCharm) {
            resultEmbed.setFooter({
                text: `Te quedan ${userData.inventory["lucky_charm"]} usos de amuleto de la suerte. Probabilidad de ganar: ${Math.round(winChance * 100)}%.`,
            });
        } else {
            resultEmbed.setFooter({
                text: `Proxima apuesta disponible en 5 minutos. Probabilidad base de ganar: ${Math.round(BASE_WIN_CHANCE * 100)}%.`,
            });
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'gamble' })
};
